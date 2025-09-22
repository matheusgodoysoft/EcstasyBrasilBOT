# Bot Proxy Discord

Bot que permite enviar mensagens para seus servidores via comandos DM (mensagem direta).

## 🚀 Funcionalidades

- **Envio via DM**: Mande comandos no privado do bot
- **Multi-servidor**: Funciona em todos os servidores onde o bot está
- **Seguro**: Só você (dono) pode usar os comandos
- **Embeds personalizados**: Mensagens aparecem com seu avatar e nome
- **Lista canais**: Veja todos os canais disponíveis

## 📋 Comandos

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `!send <#canal> <mensagem>` | Envia mensagem para o canal | `!send #geral Olá pessoal!` |
| `!list` | Lista servidores e canais | `!list` |
| `!help` | Mostra ajuda | `!help` |

## ⚙️ Configuração

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
1. Copie `.env.example` para `.env`
2. Preencha:
   - `DISCORD_TOKEN`: Token do bot
   - `OWNER_ID`: Seu ID de usuário

### 3. Criar bot no Discord Developer Portal
1. Acesse https://discord.com/developers/applications
2. Crie nova aplicação → Bot
3. Copie o token
4. **Ative estas permissões importantes:**
   - ✅ Message Content Intent
   - ✅ Server Members Intent  
   - ✅ Presence Intent

### 4. Gerar link de convite
**Scopes necessários:** `bot`

**Permissões necessárias:**
- ✅ View Channels (Ler mensagens)
- ✅ Send Messages (Enviar mensagens)
- ✅ Embed Links (Links incorporados)
- ✅ Read Message History (Ler histórico)
- ✅ Use External Emojis (Usar emojis externos)

### 5. Obter seu User ID
1. Discord → Configurações → Avançado → Modo Desenvolvedor (ON)
2. Clique com botão direito no seu nome → Copiar ID
3. Cole no `.env` como `OWNER_ID`

## 🏃‍♂️ Executar
```bash
npm start
```

## 💬 Como usar

1. **Inicie o bot** com `npm start`
2. **Mande DM para o bot** com `!help`
3. **Liste canais** com `!list`
4. **Envie mensagens** com `!send #canal sua mensagem`

### Exemplo prático:
```
Você (DM para o bot): !send #geral Oi pessoal, como vocês estão?

Bot responde: ✅ Mensagem enviada para geral em Meu Servidor!

No canal #geral aparece:
[Embed com seu avatar]
Oi pessoal, como vocês estão?
Enviado via Bot Proxy
```

## 🔒 Segurança
- Apenas o dono (OWNER_ID) pode usar comandos
- Bot só responde a DMs do dono
- Mensagens aparecem claramente como "via Bot Proxy"

## ⚠️ Observações importantes
- O bot precisa estar nos servidores onde quer enviar mensagens
- Mensagens aparecem como embeds, não como suas mensagens diretas
- Respeita os Termos de Serviço do Discord