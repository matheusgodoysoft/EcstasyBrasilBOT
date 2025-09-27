# 🐳 Docker Setup - Ecstasy Brasil Bot

Este guia te ajudará a executar o bot Discord com PostgreSQL usando Docker.

## 📋 Pré-requisitos

- ✅ Docker instalado
- ✅ Docker Compose instalado
- ✅ Token do bot Discord
- ✅ IDs necessários do Discord

## 🚀 Configuração Rápida

### 1. Configurar variáveis de ambiente
```bash
# Copiar arquivo de exemplo
cp .env.docker .env

# Editar com seus dados
notepad .env  # Windows
# ou
nano .env     # Linux/Mac
```

### 2. Preencher dados obrigatórios no .env
```env
DISCORD_TOKEN=seu_token_do_bot_aqui
OWNER_ID=seu_user_id_aqui
PAYMENT_CHANNEL_ID=id_do_canal_pagamentos
```

### 3. Iniciar serviços
```bash
# Subir apenas o banco (para desenvolvimento)
docker-compose up postgres -d

# Ou subir tudo (banco + pgAdmin)
docker-compose up -d

# Ver logs
docker-compose logs -f postgres
```

## 🗄️ Banco de Dados

### Acesso direto ao PostgreSQL
```bash
# Via Docker
docker exec -it ecstasy_bot_db psql -U bot_user -d ecstasy_bot

# Via cliente local (se tiver psql instalado)
psql -h localhost -p 5432 -U bot_user -d ecstasy_bot
```

### Acesso via pgAdmin (Interface Web)
- **URL:** http://localhost:8080
- **Email:** admin@ecstasybot.com
- **Senha:** admin123

**Configurar conexão no pgAdmin:**
- Host: postgres
- Port: 5432
- Database: ecstasy_bot
- Username: bot_user
- Password: EcstasyBot2024!

## 🤖 Executar o Bot

### Opção 1: Desenvolvimento (bot local + banco Docker)
```bash
# Subir apenas o banco
docker-compose up postgres -d

# Executar bot localmente
cd dc
npm install
node index.js
```

### Opção 2: Produção (tudo no Docker)
```bash
# Descomentar seção 'bot' no docker-compose.yml
# Depois executar:
docker-compose up -d

# Ver logs do bot
docker-compose logs -f bot
```

## 📊 Comandos Úteis

### Docker
```bash
# Ver status dos containers
docker-compose ps

# Parar tudo
docker-compose down

# Parar e remover volumes (CUIDADO: apaga dados!)
docker-compose down -v

# Rebuild do bot
docker-compose build bot

# Restart apenas do bot
docker-compose restart bot
```

### Banco de Dados
```bash
# Backup do banco
docker exec ecstasy_bot_db pg_dump -U bot_user ecstasy_bot > backup.sql

# Restaurar backup
docker exec -i ecstasy_bot_db psql -U bot_user -d ecstasy_bot < backup.sql

# Ver tabelas
docker exec ecstasy_bot_db psql -U bot_user -d ecstasy_bot -c "\dt"

# Ver estatísticas do bot
docker exec ecstasy_bot_db psql -U bot_user -d ecstasy_bot -c "SELECT * FROM get_bot_stats();"
```

## 🔧 Estrutura do Banco

### Tabelas Principais
- **users**: Usuários autorizados
- **payments**: Registro de pagamentos
- **keys_system**: Controle de keys vendidas
- **settings**: Configurações do sistema
- **image_channels**: Canais de destino por usuário
- **pending_selections**: Seleções pendentes (botões)

### Funções Úteis
```sql
-- Estatísticas gerais
SELECT * FROM get_bot_stats();

-- Limpar seleções expiradas
SELECT cleanup_expired_selections();

-- Pagamentos recentes
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

-- Usuários autorizados
SELECT discord_id, username, authorized_at FROM users;
```

## 🔒 Segurança

### Senhas Padrão (ALTERE EM PRODUÇÃO!)
- **PostgreSQL:** EcstasyBot2024!
- **pgAdmin:** admin123

### Recomendações
1. Altere as senhas padrão
2. Use volumes Docker para persistência
3. Configure backup automático
4. Monitore logs regularmente

## 🆘 Troubleshooting

### Bot não conecta ao banco
```bash
# Verificar se o banco está rodando
docker-compose ps postgres

# Ver logs do banco
docker-compose logs postgres

# Testar conexão
docker exec ecstasy_bot_db pg_isready -U bot_user
```

### Erro de permissão
```bash
# Verificar usuário do container
docker exec ecstasy_bot_db whoami

# Verificar permissões do volume
ls -la /var/lib/docker/volumes/
```

### Banco não inicializa
```bash
# Remover volume e recriar
docker-compose down -v
docker-compose up postgres -d
```

## 📈 Monitoramento

### Logs em tempo real
```bash
# Todos os serviços
docker-compose logs -f

# Apenas o bot
docker-compose logs -f bot

# Apenas o banco
docker-compose logs -f postgres
```

### Métricas do banco
```sql
-- Tamanho do banco
SELECT pg_size_pretty(pg_database_size('ecstasy_bot'));

-- Conexões ativas
SELECT count(*) FROM pg_stat_activity;

-- Tabelas maiores
SELECT schemaname,tablename,pg_size_pretty(size) as size
FROM (
    SELECT schemaname,tablename,pg_total_relation_size(schemaname||'.'||tablename) as size
    FROM pg_tables WHERE schemaname='public'
) s ORDER BY size DESC;
```

## 🎯 Próximos Passos

1. ✅ Banco configurado
2. 🔄 Migrar dados atuais
3. 🔄 Atualizar código do bot
4. 🔄 Implementar backup automático
5. 🔄 Configurar monitoramento