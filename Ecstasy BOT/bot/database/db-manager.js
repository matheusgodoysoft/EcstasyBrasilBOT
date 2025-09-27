const { Pool } = require('pg');
const BackupManager = require('./backup-manager');

class DatabaseManager {
    constructor() {
        this.pool = new Pool({
            user: process.env.DB_USER || 'bot_user',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'ecstasy_bot',
            password: process.env.DB_PASSWORD || 'bot_password',
            port: process.env.DB_PORT || 5432,
        });
        
        this.pool.on('error', (err) => {
            console.error('❌ Erro inesperado no pool de conexões:', err);
        });

        // Inicializar sistema de backup
        this.backupManager = new BackupManager({
            user: process.env.DB_USER || 'bot_user',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'ecstasy_bot',
            password: process.env.DB_PASSWORD || 'bot_password',
            port: process.env.DB_PORT || 5432,
        });
    }

    // === MÉTODOS DE USUÁRIOS ===
    async getAuthorizedUsers() {
        try {
            const result = await this.pool.query('SELECT discord_id, is_owner FROM users ORDER BY created_at');
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar usuários autorizados:', error);
            return [];
        }
    }

    async addAuthorizedUser(discordId, username = 'Authorized User', isOwner = false) {
        try {
            const result = await this.pool.query(
                'INSERT INTO users (discord_id, username, is_owner, authorized_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (discord_id) DO NOTHING RETURNING id',
                [discordId, username, isOwner]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('❌ Erro ao adicionar usuário autorizado:', error);
            return false;
        }
    }

    async removeAuthorizedUser(discordId) {
        try {
            const result = await this.pool.query('DELETE FROM users WHERE discord_id = $1', [discordId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('❌ Erro ao remover usuário autorizado:', error);
            return false;
        }
    }

    // === MÉTODOS DE CONFIGURAÇÕES ===
    async getSetting(key) {
        try {
            const result = await this.pool.query('SELECT value FROM settings WHERE key = $1', [key]);
            return result.rows.length > 0 ? result.rows[0].value : null;
        } catch (error) {
            console.error(`❌ Erro ao buscar configuração ${key}:`, error);
            return null;
        }
    }

    async setSetting(key, value, description = null, updatedBy = null) {
        try {
            const result = await this.pool.query(
                `INSERT INTO settings (key, value, description, updated_by) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (key) DO UPDATE SET 
                 value = EXCLUDED.value, 
                 updated_at = NOW(), 
                 updated_by = EXCLUDED.updated_by`,
                [key, value, description, updatedBy]
            );
            return true;
        } catch (error) {
            console.error(`❌ Erro ao definir configuração ${key}:`, error);
            return false;
        }
    }

    // === MÉTODOS DO SISTEMA DE KEYS ===
    async getKeysSystem() {
        try {
            const result = await this.pool.query('SELECT total_limit, sold_count FROM keys_system WHERE id = 1');
            if (result.rows.length > 0) {
                return result.rows[0];
            }
            return { total_limit: 100, sold_count: 0 };
        } catch (error) {
            console.error('❌ Erro ao buscar sistema de keys:', error);
            return { total_limit: 100, sold_count: 0 };
        }
    }

    async updateKeysLimit(newLimit) {
        try {
            await this.pool.query(
                'UPDATE keys_system SET total_limit = $1, updated_at = NOW() WHERE id = 1',
                [newLimit]
            );
            return true;
        } catch (error) {
            console.error('❌ Erro ao atualizar limite de keys:', error);
            return false;
        }
    }

    async incrementKeysSold() {
        try {
            const result = await this.pool.query(
                'UPDATE keys_system SET sold_count = sold_count + 1, updated_at = NOW() WHERE id = 1 RETURNING sold_count, total_limit'
            );
            if (result.rows.length > 0) {
                const { sold_count, total_limit } = result.rows[0];
                console.log(`🔑 Keys vendidas: ${sold_count}/${total_limit}`);
                return { sold_count, total_limit };
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao incrementar keys vendidas:', error);
            return null;
        }
    }

    async resetKeysSold() {
        try {
            await this.pool.query(
                'UPDATE keys_system SET sold_count = 0, updated_at = NOW() WHERE id = 1'
            );
            return true;
        } catch (error) {
            console.error('❌ Erro ao resetar keys vendidas:', error);
            return false;
        }
    }

    // === MÉTODOS DE PAGAMENTOS ===
    async addPayment(userId, username, plan, amount, paymentId, status = 'processing') {
        try {
            const result = await this.pool.query(
                `INSERT INTO payments (user_id, username, plan, amount, payment_id, status) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [userId, username, plan, amount, paymentId, status]
            );
            return result.rows[0].id;
        } catch (error) {
            console.error('❌ Erro ao adicionar pagamento:', error);
            return null;
        }
    }

    async updatePaymentStatus(paymentId, status) {
        try {
            const result = await this.pool.query(
                'UPDATE payments SET status = $1, updated_at = NOW() WHERE payment_id = $2 RETURNING *',
                [status, paymentId]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao atualizar status do pagamento:', error);
            return null;
        }
    }

    async getPayment(paymentId) {
        try {
            const result = await this.pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao buscar pagamento:', error);
            return null;
        }
    }

    async getPaymentById(paymentId) {
        try {
            const result = await this.pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao buscar pagamento por ID:', error);
            return null;
        }
    }

    async deletePayment(paymentId) {
        try {
            const result = await this.pool.query('DELETE FROM payments WHERE payment_id = $1 RETURNING *', [paymentId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao apagar pagamento:', error);
            return null;
        }
    }

    // === MÉTODOS DE SELEÇÕES PENDENTES ===
    async addPendingSelection(userId, plan, messageId) {
        try {
            await this.pool.query(
                `INSERT INTO pending_selections (user_id, plan, message_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (user_id) DO UPDATE SET 
                 plan = EXCLUDED.plan, 
                 message_id = EXCLUDED.message_id, 
                 created_at = NOW()`,
                [userId, plan, messageId]
            );
            return true;
        } catch (error) {
            console.error('❌ Erro ao adicionar seleção pendente:', error);
            return false;
        }
    }

    async getPendingSelection(userId) {
        try {
            const result = await this.pool.query('SELECT * FROM pending_selections WHERE user_id = $1', [userId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao buscar seleção pendente:', error);
            return null;
        }
    }

    async removePendingSelection(userId) {
        try {
            await this.pool.query('DELETE FROM pending_selections WHERE user_id = $1', [userId]);
            return true;
        } catch (error) {
            console.error('❌ Erro ao remover seleção pendente:', error);
            return false;
        }
    }

    // === MÉTODOS DE CANAIS DE IMAGEM ===
    async setImageChannel(userId, channelId) {
        try {
            await this.pool.query(
                `INSERT INTO image_channels (user_id, channel_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id) DO UPDATE SET 
                 channel_id = EXCLUDED.channel_id, 
                 updated_at = NOW()`,
                [userId, channelId]
            );
            return true;
        } catch (error) {
            console.error('❌ Erro ao definir canal de imagem:', error);
            return false;
        }
    }

    async getImageChannel(userId) {
        try {
            const result = await this.pool.query('SELECT channel_id FROM image_channels WHERE user_id = $1', [userId]);
            return result.rows.length > 0 ? result.rows[0].channel_id : null;
        } catch (error) {
            console.error('❌ Erro ao buscar canal de imagem:', error);
            return null;
        }
    }

    // === MÉTODOS DE NOVOS MEMBROS ===
    async addNewMember(memberData) {
        try {
            const result = await this.pool.query(
                `INSERT INTO new_members (discord_id, username, display_name, avatar_url, joined_at, account_created_at, guild_id, guild_name) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 ON CONFLICT (discord_id) DO UPDATE SET 
                 username = EXCLUDED.username,
                 display_name = EXCLUDED.display_name,
                 avatar_url = EXCLUDED.avatar_url,
                 joined_at = EXCLUDED.joined_at
                 RETURNING id`,
                [
                    memberData.discord_id,
                    memberData.username,
                    memberData.display_name,
                    memberData.avatar_url,
                    memberData.joined_at,
                    memberData.account_created_at,
                    memberData.guild_id,
                    memberData.guild_name
                ]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('❌ Erro ao adicionar novo membro:', error);
            return false;
        }
    }

    async getNewMembers(limit = 50, offset = 0) {
        try {
            const result = await this.pool.query(
                `SELECT discord_id, username, display_name, avatar_url, joined_at, account_created_at, guild_name, created_at 
                 FROM new_members 
                 ORDER BY joined_at DESC 
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar novos membros:', error);
            return [];
        }
    }

    async getNewMembersCount() {
        try {
            const result = await this.pool.query('SELECT COUNT(*) as count FROM new_members');
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('❌ Erro ao contar novos membros:', error);
            return 0;
        }
    }

    async getRecentNewMembers(days = 7) {
        try {
            const result = await this.pool.query(
                `SELECT discord_id, username, display_name, avatar_url, joined_at, account_created_at, guild_name 
                 FROM new_members 
                 WHERE joined_at >= NOW() - INTERVAL '${days} days'
                 ORDER BY joined_at DESC`,
                []
            );
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar membros recentes:', error);
            return [];
        }
    }

    // === MÉTODOS DE BACKUP ===
    async createBackup() {
        return await this.backupManager.createBackup();
    }

    async restoreBackup(backupPath) {
        return await this.backupManager.restoreBackup(backupPath);
    }

    async listBackups() {
        return await this.backupManager.listBackups();
    }

    startAutoBackup(intervalHours = 24) {
        return this.backupManager.startAutoBackup(intervalHours);
    }

    stopAutoBackup() {
        return this.backupManager.stopAutoBackup();
    }

    async getBackupStatus() {
        return await this.backupManager.getBackupStatus();
    }

    // === MÉTODOS DE KEYS ===
    async createKey(keyValue, planType, durationType, expiresAt, createdBy) {
        try {
            const result = await this.pool.query(
                `INSERT INTO keys (key_value, plan_type, duration_type, expires_at, created_by) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING *`,
                [keyValue, planType, durationType, expiresAt, createdBy]
            );
            console.log('✅ Key criada com sucesso:', result.rows[0].id);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Erro ao criar key:', error);
            return null;
        }
    }

    async getAllKeys() {
        try {
            const result = await this.pool.query(
                `SELECT k.*, u.username as created_by_username 
                 FROM keys k 
                 LEFT JOIN users u ON k.created_by = u.discord_id 
                 ORDER BY k.created_at DESC`
            );
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar keys:', error);
            return [];
        }
    }

    async getKeyById(keyId) {
        try {
            const result = await this.pool.query(
                `SELECT k.*, u.username as created_by_username 
                 FROM keys k 
                 LEFT JOIN users u ON k.created_by = u.discord_id 
                 WHERE k.id = $1`,
                [keyId]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Erro ao buscar key por ID:', error);
            return null;
        }
    }

    async getKeysByStatus(status) {
        try {
            const result = await this.pool.query(
                `SELECT k.*, u.username as created_by_username 
                 FROM keys k 
                 LEFT JOIN users u ON k.created_by = u.discord_id 
                 WHERE k.status = $1 
                 ORDER BY k.created_at DESC`,
                [status]
            );
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar keys por status:', error);
            return [];
        }
    }

    async updateKeyStatus(keyId, status, usedBy = null) {
        try {
            const updateFields = ['status = $2'];
            const values = [keyId, status];
            
            if (usedBy && status === 'used') {
                updateFields.push('used_by = $3', 'used_at = CURRENT_TIMESTAMP');
                values.push(usedBy);
            }

            const result = await this.pool.query(
                `UPDATE keys SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
                values
            );
            
            if (result.rows.length > 0) {
                console.log('✅ Status da key atualizado:', keyId);
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao atualizar status da key:', error);
            return null;
        }
    }

    async deleteKey(keyId) {
        try {
            const result = await this.pool.query(
                'DELETE FROM keys WHERE id = $1 RETURNING *',
                [keyId]
            );
            
            if (result.rows.length > 0) {
                console.log('✅ Key deletada com sucesso:', keyId);
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao deletar key:', error);
            return null;
        }
    }

    async getExpiredKeys() {
        try {
            const result = await this.pool.query(
                `SELECT * FROM keys 
                 WHERE expires_at < CURRENT_TIMESTAMP AND status = 'active'`
            );
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar keys expiradas:', error);
            return [];
        }
    }

    async markExpiredKeys() {
        try {
            const result = await this.pool.query(
                `UPDATE keys 
                 SET status = 'expired' 
                 WHERE expires_at < CURRENT_TIMESTAMP AND status = 'active' 
                 RETURNING *`
            );
            
            if (result.rows.length > 0) {
                console.log(`✅ ${result.rows.length} keys marcadas como expiradas`);
            }
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao marcar keys como expiradas:', error);
            return [];
        }
    }

    async generateUniqueKey(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let key;
        let isUnique = false;
        
        while (!isUnique) {
            key = '';
            for (let i = 0; i < length; i++) {
                key += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            // Verificar se a key já existe
            const existing = await this.pool.query(
                'SELECT id FROM keys WHERE key_value = $1',
                [key]
            );
            
            if (existing.rows.length === 0) {
                isUnique = true;
            }
        }
        
        return key;
    }

    // === MÉTODO DE FECHAMENTO ===
    async close() {
        // Parar backup automático antes de fechar
        this.backupManager.stopAutoBackup();
        await this.pool.end();
    }
}

module.exports = DatabaseManager;