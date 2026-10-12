# Android — Nexo Forms

## Preparar

Na raiz, execute `scripts/install-dependencies.ps1` para instalar os SDKs e pacotes. Use `scripts/env.ps1` para carregar os caminhos locais no PowerShell.

## Gerar APK

Execute `scripts/build-android.ps1`. O APK ARM64 fica em `.artifacts/NexoForms-arm64-v8a.apk`.

## Desenvolver

Em NexoFormsApp, execute `npm start` e, em outro terminal com o ambiente carregado, `npm run android`.

O [README do projeto](../README.md) contém o mapa das telas e os passos de administração e uso pelos participantes.
