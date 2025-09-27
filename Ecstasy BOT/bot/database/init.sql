-- Criação do banco de dados Ecstasy Bot
-- Este script será executado automaticamente na primeira inicialização

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de usuários autorizados
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(100),
    is_owner BOOLEAN DEFAULT FALSE,
    authorized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de sistema de keys
CREATE TABLE IF NOT EXISTS keys_system (
    id SERIAL PRIMARY KEY,
    total_limit INTEGER DEFAULT 100,
    sold_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) REFERENCES users(discord_id)
);

-- Tabela de pagamentos
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_discord_id VARCHAR(20) NOT NULL,
    username VARCHAR(100),
    plan VARCHAR(50) NOT NULL, -- 'standard', 'infinity', 'outros'
    amount DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled'
    payment_method VARCHAR(20), -- 'pix', 'card'
    transaction_id VARCHAR(100),
    metadata JSONB, -- dados extras do pagamento
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) REFERENCES users(discord_id)
);

-- Tabela de canais de destino de imagens
CREATE TABLE IF NOT EXISTS image_channels (
    id SERIAL PRIMARY KEY,
    user_discord_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_discord_id, channel_id)
);

-- Tabela de seleções pendentes (para botões de pagamento)
CREATE TABLE IF NOT EXISTS pending_selections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_discord_id VARCHAR(20) NOT NULL,
    selection_type VARCHAR(50) NOT NULL, -- 'payment_plan', 'payment_method', etc
    selection_data JSONB,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Tabela de keys para o dashboard
CREATE TABLE IF NOT EXISTS keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_value VARCHAR(255) UNIQUE NOT NULL,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('standard', 'infinity')),
    duration_type VARCHAR(20) NOT NULL CHECK (duration_type IN ('weekly', 'monthly')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    used_by VARCHAR(20), -- discord_id do usuário que usou a key
    created_by VARCHAR(20) REFERENCES users(discord_id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_discord_id ON payments(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_pending_selections_user ON pending_selections(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_pending_selections_expires ON pending_selections(expires_at);

CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);
CREATE INDEX IF NOT EXISTS idx_keys_plan_type ON keys(plan_type);
CREATE INDEX IF NOT EXISTS idx_keys_expires_at ON keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_keys_used_by ON keys(used_by);

-- Triggers para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_keys_system_updated_at BEFORE UPDATE ON keys_system
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();



CREATE TRIGGER update_keys_updated_at BEFORE UPDATE ON keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir configurações padrão
INSERT INTO settings (key, value, description) VALUES
    ('atendimento_ativo', 'false', 'Status do sistema de atendimento'),
    ('keys_limit', '100', 'Limite total de keys'),
    ('webhook_port', '3001', 'Porta do servidor webhook')
ON CONFLICT (key) DO NOTHING;

-- Inserir sistema de keys padrão
INSERT INTO keys_system (total_limit, sold_count) VALUES (100, 0)
ON CONFLICT DO NOTHING;

-- Função para limpar seleções pendentes expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_selections()
RETURNS void AS $$
BEGIN
    DELETE FROM pending_selections WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Função para obter estatísticas do bot
CREATE OR REPLACE FUNCTION get_bot_stats()
RETURNS TABLE(
    keys_sold INTEGER,
    total_users INTEGER,
    total_payments BIGINT,
    pending_payments BIGINT,
    confirmed_payments BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(ks.sold_count, 0) as keys_sold,
        COALESCE((SELECT COUNT(*)::INTEGER FROM users WHERE discord_id IS NOT NULL), 0) as total_users,
        COALESCE((SELECT COUNT(*) FROM payments), 0) as total_payments,
        COALESCE((SELECT COUNT(*) FROM payments WHERE status = 'pending'), 0) as pending_payments,
        COALESCE((SELECT COUNT(*) FROM payments WHERE status = 'confirmed'), 0) as confirmed_payments
    FROM keys_system ks
    ORDER BY ks.id DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Tabela de novos membros do Discord
CREATE TABLE IF NOT EXISTS new_members (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    joined_at TIMESTAMP NOT NULL,
    account_created_at TIMESTAMP,
    guild_id VARCHAR(20) NOT NULL,
    guild_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance da tabela new_members
CREATE INDEX IF NOT EXISTS idx_new_members_discord_id ON new_members(discord_id);
CREATE INDEX IF NOT EXISTS idx_new_members_joined_at ON new_members(joined_at);
CREATE INDEX IF NOT EXISTS idx_new_members_guild_id ON new_members(guild_id);

-- Comentários nas tabelas
COMMENT ON TABLE users IS 'Usuários autorizados a usar o bot';
COMMENT ON TABLE keys_system IS 'Sistema de controle de keys vendidas';
COMMENT ON TABLE payments IS 'Registro de todos os pagamentos';
COMMENT ON TABLE settings IS 'Configurações gerais do sistema';
COMMENT ON TABLE image_channels IS 'Canais de destino para imagens por usuário';
COMMENT ON TABLE pending_selections IS 'Seleções pendentes de usuários (botões, etc)';
COMMENT ON TABLE new_members IS 'Novos membros que entraram no servidor Discord';
COMMENT ON TABLE keys IS 'Keys para o dashboard com controle de expiração e uso';

-- Mensagem de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Banco de dados Ecstasy Bot inicializado com sucesso!';
    RAISE NOTICE 'Tabelas criadas: users, keys_system, payments, settings, image_channels, pending_selections';
    RAISE NOTICE 'Funções criadas: get_bot_stats(), cleanup_expired_selections()';
END $$;