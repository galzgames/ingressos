# 🎮 GalzGames Ingressos

Sistema completo de geração e validação de ingressos online para eventos GalzGames.

## ✅ Funcionalidades

- **Página pública** com banner do evento personalizável
- **3 tipos de ingresso**: Normal, VIP, Meia-Entrada
- **Ingresso visual** com imagem de fundo, número único e QR Code
- **Validação** por número de ingresso
- **Painel Admin**: trocar imagem, editar dados do evento, ver vendas

## 🚀 Como rodar

### Requisitos
- Node.js 14+

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/galzgames-ingressos.git
cd galzgames-ingressos

# Rodar o servidor
node server.js
```

Acesse: **http://localhost:3000**

## 📁 Estrutura

```
galzgames-ingressos/
├── server.js           ← Backend Node.js (sem dependências)
├── package.json
├── data/
│   ├── tickets.json    ← Ingressos gerados (auto-criado)
│   └── config.json     ← Configurações do evento (auto-criado)
└── public/
    ├── index.html      ← Frontend completo
    └── images/
        ├── logo.png
        ├── banner.jpeg
        └── uploads/    ← Imagens enviadas pelo admin
```

## 🌐 Deploy no Railway / Render / Fly.io

1. Suba o repositório no GitHub
2. Conecte ao Railway ou Render
3. Defina `node server.js` como comando de start
4. Pronto! 🎉

## 🔌 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/config` | Configurações do evento |
| POST | `/api/config` | Atualizar configurações |
| GET | `/api/tickets` | Listar todos os ingressos |
| POST | `/api/tickets` | Gerar novo ingresso |
| POST | `/api/validate/:number` | Validar ingresso |
| POST | `/api/upload-bg` | Enviar imagem de fundo |

## 📝 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| PORT | 3000 | Porta do servidor |
