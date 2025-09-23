# 🚂 Deploy do Ecstasy Brasil BOT no Railway

Este guia te ajudará a fazer o deploy do bot Discord no Railway.

## 📋 Pré-requisitos

1. ✅ Conta no GitHub (já feito)
2. ✅ Repositório no GitHub (já feito)
3. 🔲 Conta no Railway
4. 🔲 Token do bot Discord
5. 🔲 IDs necessários do Discord

## 🚀 Passo a passo

### 1. Criar conta no Railway
1. Acesse: https://railway.app
2. Clique em "Start a New Project"
3. Faça login com sua conta GitHub

### 2. Conectar repositório
1. No Railway, clique em "Deploy from GitHub repo"
2. Selecione o repositório: `matheusgodoysoft/EcstasyBrasilBOT`
3. Selecione a pasta: `Ecstasy BOT/bot/dc`

### 3. Configurar variáveis de ambiente
No Railway, vá em Settings > Variables e adicione:

#### Obrigatórias:
- `DISCORD_TOKEN`: Token do seu bot Discord
- `OWNER_ID`: Seu ID de usuário no Discord
- `PAYMENT_CHANNEL_ID`: ID do canal para comprovantes

#### Opcionais:
- `AUTHORIZED_USERS`: IDs de usuários autorizados (separados por vírgula)
- `WEBHOOK_PORT`: 3000 (padrão)

#### Links de pagamento (já configurados):
- `KIRVANO_STANDARD_PIX_LINK`
- `KIRVANO_STANDARD_CARD_LINK`
- `KIRVANO_INFINITY_PIX_LINK`
- `KIRVANO_INFINITY_CARD_LINK`

### 4. Como obter os IDs necessários

#### Token do Bot Discord:
1. Acesse: https://discord.com/developers/applications
2. Selecione sua aplicação
3. Vá em "Bot" > "Token" > "Copy"

#### Seu User ID:
1. No Discord, ative o Modo Desenvolvedor (Configurações > Avançado > Modo Desenvolvedor)
2. Clique com botão direito no seu nome > "Copiar ID"

#### ID do Canal:
1. Com Modo Desenvolvedor ativo
2. Clique com botão direito no canal > "Copiar ID"

## 🔧 Configurações do Railway

O projeto já inclui:
- `railway.json`: Configurações específicas do Railway
- `Procfile`: Comando de inicialização
- `package.json`: Dependências e scripts

## 🎯 Após o Deploy

1. O bot ficará online 24/7
2. Você receberá uma URL do webhook (se necessário)
3. O bot responderá aos comandos via DM

## 📞 Comandos principais

- `!help`: Lista todos os comandos
- `!send #canal mensagem`: Enviar mensagem
- `!payment`: Sistema de pagamentos
- `!list`: Listar servidores e canais

## 🔒 Segurança

- Nunca compartilhe seu `DISCORD_TOKEN`
- Adicione apenas usuários confiáveis em `AUTHORIZED_USERS`
- O dono (`OWNER_ID`) tem acesso total ao bot

## 🆘 Problemas comuns

1. **Bot não conecta**: Verifique o `DISCORD_TOKEN`
2. **Comandos não funcionam**: Verifique o `OWNER_ID`
3. **Webhook não funciona**: Verifique a `WEBHOOK_PORT`

## 💰 Custos

- Railway oferece 500 horas gratuitas por mês
- Suficiente para manter o bot online 24/7
- Após o limite, custa ~$5/mês