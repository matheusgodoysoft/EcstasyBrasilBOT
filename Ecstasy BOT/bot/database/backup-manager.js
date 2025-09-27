const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class BackupManager {
    constructor(dbConfig) {
        this.dbConfig = dbConfig;
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.maxBackups = 7; // Manter apenas os últimos 7 backups
        this.backupInterval = null;
        
        this.ensureBackupDirectory();
    }

    async ensureBackupDirectory() {
        try {
            await fs.access(this.backupDir);
        } catch (error) {
            await fs.mkdir(this.backupDir, { recursive: true });
            console.log(`📁 Diretório de backup criado: ${this.backupDir}`);
        }
    }

    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `ecstasy_bot_backup_${timestamp}.sql`;
            const backupPath = path.join(this.backupDir, backupFileName);

            console.log('🔄 Iniciando backup do banco de dados...');

            // Comando pg_dump para criar o backup
            const pgDumpCommand = `pg_dump -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} -f "${backupPath}" --no-password`;

            // Definir a senha como variável de ambiente para o comando
            const env = { ...process.env, PGPASSWORD: this.dbConfig.password };

            await execAsync(pgDumpCommand, { env });

            // Verificar se o arquivo foi criado
            const stats = await fs.stat(backupPath);
            if (stats.size > 0) {
                console.log(`✅ Backup criado com sucesso: ${backupFileName} (${(stats.size / 1024).toFixed(2)} KB)`);
                
                // Limpar backups antigos
                await this.cleanOldBackups();
                
                return backupPath;
            } else {
                throw new Error('Arquivo de backup vazio');
            }

        } catch (error) {
            console.error('❌ Erro ao criar backup:', error.message);
            throw error;
        }
    }

    async cleanOldBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files
                .filter(file => file.startsWith('ecstasy_bot_backup_') && file.endsWith('.sql'))
                .map(file => ({
                    name: file,
                    path: path.join(this.backupDir, file),
                    time: fs.stat(path.join(this.backupDir, file)).then(stats => stats.mtime)
                }));

            // Aguardar todas as promessas de stat
            for (let file of backupFiles) {
                file.time = await file.time;
            }

            // Ordenar por data (mais recente primeiro)
            backupFiles.sort((a, b) => b.time - a.time);

            // Remover backups excedentes
            if (backupFiles.length > this.maxBackups) {
                const filesToDelete = backupFiles.slice(this.maxBackups);
                
                for (const file of filesToDelete) {
                    await fs.unlink(file.path);
                    console.log(`🗑️ Backup antigo removido: ${file.name}`);
                }
            }

        } catch (error) {
            console.error('⚠️ Erro ao limpar backups antigos:', error.message);
        }
    }

    async restoreBackup(backupPath) {
        try {
            console.log(`🔄 Restaurando backup: ${path.basename(backupPath)}`);

            // Comando psql para restaurar o backup
            const psqlCommand = `psql -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} -f "${backupPath}" --no-password`;

            // Definir a senha como variável de ambiente
            const env = { ...process.env, PGPASSWORD: this.dbConfig.password };

            await execAsync(psqlCommand, { env });

            console.log('✅ Backup restaurado com sucesso!');
            return true;

        } catch (error) {
            console.error('❌ Erro ao restaurar backup:', error.message);
            throw error;
        }
    }

    async listBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = [];

            for (const file of files) {
                if (file.startsWith('ecstasy_bot_backup_') && file.endsWith('.sql')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = await fs.stat(filePath);
                    
                    backupFiles.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        created: stats.mtime,
                        sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`
                    });
                }
            }

            // Ordenar por data (mais recente primeiro)
            backupFiles.sort((a, b) => b.created - a.created);

            return backupFiles;

        } catch (error) {
            console.error('❌ Erro ao listar backups:', error.message);
            return [];
        }
    }

    startAutoBackup(intervalHours = 24) {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        const intervalMs = intervalHours * 60 * 60 * 1000; // Converter horas para milissegundos

        console.log(`⏰ Backup automático configurado para cada ${intervalHours} horas`);

        // Criar backup inicial
        this.createBackup().catch(error => {
            console.error('❌ Erro no backup inicial:', error.message);
        });

        // Configurar backup periódico
        this.backupInterval = setInterval(async () => {
            try {
                await this.createBackup();
            } catch (error) {
                console.error('❌ Erro no backup automático:', error.message);
            }
        }, intervalMs);

        return this.backupInterval;
    }

    stopAutoBackup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
            console.log('⏹️ Backup automático interrompido');
            return true;
        }
        return false;
    }

    async getBackupStatus() {
        const backups = await this.listBackups();
        const isAutoBackupActive = this.backupInterval !== null;
        
        return {
            totalBackups: backups.length,
            latestBackup: backups.length > 0 ? backups[0] : null,
            autoBackupActive: isAutoBackupActive,
            backupDirectory: this.backupDir,
            maxBackups: this.maxBackups
        };
    }
}

module.exports = BackupManager;