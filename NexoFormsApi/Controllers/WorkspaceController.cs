using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace NexoFormsApi.Controllers;

// Espaço persistente com administração do proprietário e respostas por usuário.
[ApiController]
[Route("api/workspace")]
public class WorkspaceController : ControllerBase
{
    private static readonly object Gate = new();
    private readonly string path;
    private readonly string ownerEmail;
    public WorkspaceController(IWebHostEnvironment env, IConfiguration configuration)
    {
        path = Path.Combine(Environment.GetEnvironmentVariable("NEXO_DATA_DIR") ?? Path.Combine(env.ContentRootPath, "App_Data"), "workspace.json");
        ownerEmail = (configuration["Nexo:OwnerEmail"] ?? "").Trim().ToLowerInvariant();
    }
    public record Account(string Id, string Name, string Email, string Role, string Salt, string Hash);
    public record Session(string UserId, DateTime Expires);
    public record Question(string Id, string Title, string Type, bool Required, string[] Options);
    public record Form(string Id, string Title, Question[] Questions, string[] UserIds);
    public record Answer(string FormId, string UserId, Dictionary<string, string> Values, Dictionary<string, string[]> Photos, bool Completed, int Revision);
    public class Store
    {
        public List<Account> Users { get; set; } = new();
        public List<Form> Forms { get; set; } = new();
        public List<Answer> Answers { get; set; } = new();
        public Dictionary<string, Session> Sessions { get; set; } = new();
        public Dictionary<string, int> Applied { get; set; } = new();
    }
    public record LoginRequest(string Email, string Password);
    public record UserRequest(string Name, string Email, string Password, string Role);
    public record AnswerRequest(string OperationId, Answer Answer);
    private Store Read() => System.IO.File.Exists(path) ? JsonSerializer.Deserialize<Store>(System.IO.File.ReadAllText(path))! : new();
    private void Save(Store store)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        System.IO.File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(store));
        System.IO.File.Move(path + ".tmp", path, true);
    }
    private static string Hash(string password, string salt) => Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 210000, HashAlgorithmName.SHA256, 32));
    private static bool ValidPhoto(string value)
    {
        if (value.Length > 3_000_000) return false;
        var jpeg = value.StartsWith("data:image/jpeg;base64,");
        var png = value.StartsWith("data:image/png;base64,");
        if (!jpeg && !png) return false;
        try
        {
            var bytes = Convert.FromBase64String(value[(value.IndexOf(',') + 1)..]);
            return jpeg ? bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255
                : bytes.Length >= 8 && bytes.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        }
        catch (FormatException) { return false; }
    }
    private Account? Current(Store store)
    {
        var token = Request.Headers.Authorization.ToString().Replace("Bearer ", "");
        return store.Sessions.TryGetValue(token, out var session) && session.Expires > DateTime.UtcNow
            ? store.Users.Find(u => u.Id == session.UserId) : null;
    }
    private static object Public(Account u) => new { u.Id, u.Name, u.Email, u.Role };
    private static object Snapshot(Store s, Account u) => new
    {
        user = Public(u), users = s.Users.Where(x => u.Role == "admin" || x.Id == u.Id).Select(Public),
        forms = s.Forms.Where(f => u.Role == "admin" || f.UserIds.Contains(u.Id)),
        answers = s.Answers.Where(a => u.Role == "admin" || a.UserId == u.Id)
    };
    [HttpGet("status")]
    public IActionResult Status() { lock (Gate) return Ok(new { needsSetup = Read().Users.Count == 0 }); }
    [HttpPost("setup")]
    [EnableRateLimiting("auth")]
    public IActionResult Setup(UserRequest request)
    {
        // The first administrator requires a server-side setup code, never a public first-come signup.
        var code = Environment.GetEnvironmentVariable("NEXO_SETUP_CODE");
        if (string.IsNullOrWhiteSpace(code) || Request.Headers["X-Setup-Code"] != code) return Unauthorized();
        if (string.IsNullOrWhiteSpace(ownerEmail) || request.Email.Trim().ToLowerInvariant() != ownerEmail) return BadRequest("Use o e-mail do proprietário configurado no servidor para criar o administrador.");
        lock (Gate)
        {
            var s = Read(); if (s.Users.Count != 0) return Conflict("Configuração já realizada.");
            return AddUser(s, request with { Role = "admin" });
        }
    }
    private IActionResult AddUser(Store s, UserRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name) || !System.Net.Mail.MailAddress.TryCreate(r.Email, out _) || r.Password.Length < 8 || r.Role is not ("admin" or "member")) return BadRequest("Informe nome, e-mail válido e senha de pelo menos 8 caracteres.");
        var email = r.Email.Trim().ToLowerInvariant();
        if (s.Users.Any(u => u.Email == email)) return Conflict("E-mail já cadastrado.");
        var salt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
        var user = new Account(Guid.NewGuid().ToString(), r.Name.Trim(), email, r.Role, salt, Hash(r.Password, salt));
        s.Users.Add(user); Save(s); return Ok(Public(user));
    }
    [HttpPost("users")]
    public IActionResult Users(UserRequest r) { lock (Gate) { var s = Read(); if (Current(s)?.Role != "admin") return Unauthorized(); return AddUser(s, r with { Role = "member" }); } }
    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public IActionResult Login(LoginRequest r)
    {
        lock (Gate)
        {
            var s = Read(); var u = s.Users.Find(x => x.Email == r.Email.Trim().ToLowerInvariant());
            if (u == null || !CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(u.Hash), Convert.FromBase64String(Hash(r.Password, u.Salt)))) return Unauthorized("E-mail ou senha inválidos.");
            foreach (var key in s.Sessions.Where(x => x.Value.Expires <= DateTime.UtcNow).Select(x => x.Key).ToArray()) s.Sessions.Remove(key);
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)); s.Sessions[token] = new(u.Id, DateTime.UtcNow.AddDays(7)); Save(s);
            return Ok(new { token, data = Snapshot(s, u) });
        }
    }
    [HttpPost("logout")]
    public IActionResult Logout() { lock (Gate) { var s = Read(); s.Sessions.Remove(Request.Headers.Authorization.ToString().Replace("Bearer ", "")); Save(s); return Ok(); } }
    [HttpGet("snapshot")]
    public IActionResult GetSnapshot() { lock (Gate) { var s = Read(); var u = Current(s); return u == null ? Unauthorized() : Ok(Snapshot(s, u)); } }
    [HttpGet("offline-salt")]
    public IActionResult OfflineSalt()
    {
        lock (Gate)
        {
            if (Current(Read()) == null) return Unauthorized();
            return Ok(new { salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)) });
        }
    }
    [HttpPost("forms")]
    public IActionResult Forms(Form f)
    {
        lock (Gate)
        {
            var s = Read(); if (Current(s)?.Role != "admin") return Unauthorized();
            if (string.IsNullOrWhiteSpace(f.Id) || string.IsNullOrWhiteSpace(f.Title) || f.Questions.Length == 0 || f.UserIds.Length == 0 || f.UserIds.Any(id => !s.Users.Any(u => u.Id == id)) || f.Questions.Any(q => string.IsNullOrWhiteSpace(q.Id) || string.IsNullOrWhiteSpace(q.Title) || q.Type is not ("text" or "yesno" or "choice") || (q.Type == "choice" && q.Options.Length < 2)) || f.Questions.Select(q => q.Id).Distinct().Count() != f.Questions.Length) return BadRequest("Questionário ou atribuição inválida.");
            if (s.Forms.Any(x => x.Id == f.Id)) return Conflict("Questionário já existe.");
            s.Forms.Add(f); Save(s); return Ok(f);
        }
    }
    [HttpPut("forms/{id}/users")]
    public IActionResult Assign(string id, string[] userIds)
    {
        lock (Gate)
        {
            var s = Read(); if (Current(s)?.Role != "admin") return Unauthorized();
            var index = s.Forms.FindIndex(f => f.Id == id); if (index < 0) return NotFound();
            if (userIds.Length == 0 || userIds.Any(uid => !s.Users.Any(u => u.Id == uid))) return BadRequest("Selecione usuários válidos.");
            s.Forms[index] = s.Forms[index] with { UserIds = userIds.Distinct().ToArray() }; Save(s); return Ok();
        }
    }
    [HttpPost("answers")]
    [RequestSizeLimit(25_000_000)]
    public IActionResult Answers(AnswerRequest r)
    {
        lock (Gate)
        {
            var s = Read(); var u = Current(s); if (u == null) return Unauthorized();
            var a = r.Answer; var f = s.Forms.Find(x => x.Id == a.FormId);
            if (string.IsNullOrWhiteSpace(r.OperationId)) return BadRequest("Identificador da operação obrigatório.");
            if (a.UserId != u.Id || f == null || !f.UserIds.Contains(u.Id)) return StatusCode(403);
            var operationKey = u.Id + ":" + r.OperationId;
            if (s.Applied.TryGetValue(operationKey, out var revision)) return Ok(new { revision });
            var old = s.Answers.Find(x => x.UserId == u.Id && x.FormId == a.FormId);
            if ((old?.Revision ?? 0) != a.Revision) return Conflict("Resposta alterada em outro aparelho. Atualize antes de reenviar.");
            if (a.Values.Keys.Concat(a.Photos.Keys).Any(id => !f.Questions.Any(q => q.Id == id)) || a.Photos.Values.Any(p => p.Length > 5 || p.Any(v => !ValidPhoto(v)))) return BadRequest("Anexos ou perguntas inválidos.");
            if (f.Questions.Any(q => a.Values.TryGetValue(q.Id, out var v) && !string.IsNullOrEmpty(v) && ((q.Type == "yesno" && v is not ("Sim" or "Não")) || (q.Type == "choice" && !q.Options.Contains(v))))) return BadRequest("Opção inválida.");
            if (a.Completed && f.Questions.Any(q => q.Required && (!a.Values.TryGetValue(q.Id, out var v) || string.IsNullOrWhiteSpace(v)))) return BadRequest("Responda às perguntas obrigatórias.");
            if (old != null) s.Answers.Remove(old); var next = a with { Revision = a.Revision + 1 }; s.Answers.Add(next); s.Applied[operationKey] = next.Revision; Save(s); return Ok(new { revision = next.Revision });
        }
    }
}
