# Nara IA — preparação para APK Android

O repositório usa Vite + React + Capacitor e inclui um workflow do GitHub Actions para gerar APK debug.

## Gerar APK
1. Abra a aba Actions deste repositório.
2. Selecione Build Android APK e clique em Run workflow na branch main.
3. Ao concluir, baixe o artefato nara-debug-apk no resultado da execução.

O APK é de desenvolvimento, não uma versão release assinada. O modelo local experimental exige internet no primeiro download (cerca de 1,6 GB) e suporte WebGPU no Android WebView; isso precisa ser testado no aparelho real.