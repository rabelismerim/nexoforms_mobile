using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
namespace NexoFormsApi;

public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddControllers();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
    }
    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        if (!env.IsDevelopment()) {app.UseHsts(); app.UseHttpsRedirection();}
        app.UseRouting();
        app.UseRateLimiter();
        app.UseEndpoints(endpoints => endpoints.MapControllers());
    }
}
