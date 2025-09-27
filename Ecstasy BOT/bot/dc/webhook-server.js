const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class WebhookServer {
    constructor(client, payments, dbManager) {
        this.client = client;
        this.payments = payments;
        this.dbManager = dbManager;
        this.app = express();
        this.port = process.env.WEBHOOK_PORT || 3000;
        this.paymentUserMappings = new Map(); // Mapeia paymentId -> userId

        // Criar diretório de uploads se não existir
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Configuração do multer para upload de arquivos
        this.upload = multer({
            dest: uploadsDir,
            limits: {
                fileSize: 25 * 1024 * 1024, // 25MB (limite do Discord)
                files: 1 // 1 arquivo por vez
            },
            fileFilter: (req, file, cb) => {
                // Tipos de arquivo permitidos
                const allowedTypes = [
                    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'
                ];
                
                if (allowedTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Tipo de arquivo não permitido. Use apenas imagens (JPEG, PNG, GIF, WebP) ou vídeos (MP4, AVI, MOV, WMV, WebM).'));
                }
            }
        });

        // Middleware para parsing JSON (apenas para rotas que não são multipart)
        this.app.use((req, res, next) => {
            // Skip JSON parsing for file upload routes
            if (req.path.includes('with-file')) {
                return next();
            }
            express.json({ limit: '10mb' })(req, res, next);
        });
        
        // Não pular urlencoded para rotas with-file, pois o multer precisa dele
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Servir arquivos estáticos do dashboard
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // Middleware de logging
        this.app.use((req, res, next) => {
            console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
            next();
        });

        this.setupRoutes();
    }

    addPaymentUserMapping(paymentId, userId) {
        this.paymentUserMappings.set(paymentId, userId);
        console.log(`🔗 Mapeamento adicionado: ${paymentId} -> ${userId}`);
    }

    removePaymentUserMapping(paymentId) {
        this.paymentUserMappings.delete(paymentId);
        console.log(`🗑️ Mapeamento removido: ${paymentId}`);
    }

    setupRoutes() {
        // === AUTHENTICATION ROUTES ===
        
        // Middleware para verificar autenticação
        const authenticateToken = (req, res, next) => {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ success: false, message: 'Token de acesso requerido' });
            }

            jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
                if (err) {
                    return res.status(403).json({ success: false, message: 'Token inválido' });
                }
                req.user = user;
                next();
            });
        };

        // Rota de login
        this.app.post('/api/login', async (req, res) => {
            try {
                const { username, password } = req.body;

                if (!username || !password) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Usuário e senha são obrigatórios' 
                    });
                }

                // Verificar credenciais
                if (username !== process.env.ADMIN_USERNAME) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Credenciais inválidas' 
                    });
                }

                // Verificar senha (comparar com hash bcrypt)
                const isValidPassword = await bcrypt.compare(password, process.env.ADMIN_PASSWORD);
                if (!isValidPassword) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Credenciais inválidas' 
                    });
                }

                // Gerar token JWT
                const token = jwt.sign(
                    { username: username, role: 'admin' },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({ 
                    success: true, 
                    token: token,
                    message: 'Login realizado com sucesso'
                });

            } catch (error) {
                console.error('Erro no login:', error);
                res.status(500).json({ 
                    success: false, 
                    message: 'Erro interno do servidor' 
                });
            }
        });

        // Rota para verificar se o token é válido
        this.app.get('/api/verify-token', authenticateToken, (req, res) => {
            res.json({ 
                success: true, 
                user: req.user,
                message: 'Token válido'
            });
        });

        // === DASHBOARD API ROUTES ===
        
        // Rota principal do dashboard (protegida)
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Rota para página de login
        this.app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'login.html'));
        });

        // API - Estatísticas (protegida)
        this.app.get('/api/stats', authenticateToken, (req, res) => {
            try {
                // Obter contagem de membros do servidor Discord
                let discordMembers = 0;
                if (this.client.isReady() && this.client.guilds.cache.size > 0) {
                    // Somar membros de todos os servidores onde o bot está
                    this.client.guilds.cache.forEach(guild => {
                        discordMembers += guild.memberCount;
                    });
                }

                const stats = {
                    totalUsers: global.authorizedUsers ? global.authorizedUsers.size : 0,
                    discordMembers: discordMembers,
                    totalPayments: this.payments.size,
                    botStatus: this.client.isReady() ? 'Online' : 'Offline'
                };
                res.json({ success: true, data: stats });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API - Buscar canais do servidor (protegida)
        this.app.get('/api/channels', authenticateToken, async (req, res) => {
            try {
                const channels = [];
                
                // Buscar todos os canais de texto dos servidores onde o bot está
                this.client.guilds.cache.forEach(guild => {
                    guild.channels.cache.forEach(channel => {
                        // Apenas canais de texto onde o bot pode enviar mensagens
                        if (channel.type === 0 && channel.permissionsFor(this.client.user).has('SendMessages')) {
                            channels.push({
                                id: channel.id,
                                name: channel.name,
                                guild: guild.name,
                                guildId: guild.id
                            });
                        }
                    });
                });

                // Ordenar por servidor e depois por nome do canal
                channels.sort((a, b) => {
                    if (a.guild !== b.guild) {
                        return a.guild.localeCompare(b.guild);
                    }
                    return a.name.localeCompare(b.name);
                });

                res.json({ success: true, channels });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Enviar mensagem para canal (protegida)
        this.app.post('/api/send-channel-message', authenticateToken, async (req, res) => {
            try {
                const { channelId, message } = req.body;
                const channel = this.client.channels.cache.get(channelId);
                
                if (!channel) {
                    return res.json({ success: false, error: 'Canal não encontrado' });
                }

                await channel.send(message);
                res.json({ success: true });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Enviar DM (protegida)
        this.app.post('/api/send-dm', authenticateToken, async (req, res) => {
            try {
                const { userId, message } = req.body;
                const user = await this.client.users.fetch(userId);
                
                if (!user) {
                    return res.json({ success: false, error: 'Usuário não encontrado' });
                }

                await user.send(message);
                res.json({ success: true });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Enviar mensagem para canal com arquivo (protegida)
        this.app.post('/api/send-channel-message-with-file', authenticateToken, (req, res, next) => {
            console.log('🔍 Headers recebidos:', req.headers);
            console.log('🔍 Content-Type:', req.headers['content-type']);
            next();
        }, this.upload.single('file'), async (req, res) => {
            try {
                // Com multer, os campos de texto ficam em req.body e o arquivo em req.file
                const channelId = req.body.channelId;
                const message = req.body.message;
                const file = req.file;
                
                console.log('📤 Dados recebidos:', { channelId, message, file: file ? file.originalname : 'nenhum' });
                console.log('📤 req.body completo:', req.body);
                console.log('📤 req.file:', file);
                
                if (!channelId) {
                    console.error('❌ channelId não fornecido ou undefined');
                    return res.json({ success: false, error: 'channelId é obrigatório' });
                }
                
                const channel = await this.client.channels.fetch(channelId);
                
                if (!channel) {
                    // Limpar arquivo se upload falhou
                    if (file && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                    return res.json({ success: false, error: 'Canal não encontrado' });
                }

                const messageOptions = {};
                
                if (message) {
                    messageOptions.content = message;
                }
                
                if (file) {
                    messageOptions.files = [{
                        attachment: file.path,
                        name: file.originalname
                    }];
                }

                await channel.send(messageOptions);
                
                // Limpar arquivo após envio
                if (file && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                
                res.json({ success: true });
            } catch (error) {
                // Limpar arquivo em caso de erro
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                res.json({ success: false, error: error.message });
            }
        });

        // API - Enviar DM com arquivo (protegida)
        this.app.post('/api/send-dm-with-file', authenticateToken, this.upload.single('file'), async (req, res) => {
            try {
                const { userId, message } = req.body;
                const file = req.file;
                
                const user = await this.client.users.fetch(userId);
                
                if (!user) {
                    // Limpar arquivo se upload falhou
                    if (file && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                    return res.json({ success: false, error: 'Usuário não encontrado' });
                }

                const messageOptions = {};
                
                if (message) {
                    messageOptions.content = message;
                }
                
                if (file) {
                    messageOptions.files = [{
                        attachment: file.path,
                        name: file.originalname
                    }];
                }

                await user.send(messageOptions);
                
                // Limpar arquivo após envio
                if (file && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                
                res.json({ success: true });
            } catch (error) {
                // Limpar arquivo em caso de erro
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                res.json({ success: false, error: error.message });
            }
        });

        // API - Iniciar pagamento (protegida)
        this.app.post('/api/initiate-payment', authenticateToken, async (req, res) => {
            try {
                const { userId, plan } = req.body;
                const user = await this.client.users.fetch(userId);
                
                if (!user) {
                    return res.json({ success: false, error: 'Usuário não encontrado' });
                }

                // Criar embed de pagamento diretamente
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                
                const embed = new EmbedBuilder()
                    .setTitle('💎 Escolha seu Plano - Ecstasy Brasil')
                    .setDescription(`Olá ${user.username}! Escolha o plano que melhor se adequa às suas necessidades:`)
                    .setColor('#5865F2')
                    .addFields(
                        {
                            name: '🥉 Ecstasy Standard',
                            value: '• **Preço:** R$ 99,99\n• Funcionalidades básicas\n• Suporte padrão',
                            inline: true
                        },
                        {
                            name: '🏆 Ecstasy Infinity',
                            value: '• **Preço:** R$ 349,99\n• Todas as funcionalidades\n• Suporte premium\n• 🔒 Indetectável por todos os sistemas\n• ✅ Garantia de 100% de bypass',
                            inline: true
                        },
                        {
                            name: '📋 Como proceder',
                            value: 'Clique no botão do plano desejado para receber o link de pagamento.',
                            inline: false
                        }
                    )
                    .setThumbnail(this.client.user.displayAvatarURL())
                    .setTimestamp()
                    .setFooter({
                        text: 'Ecstasy Brasil - Sistema de Pagamento',
                        iconURL: this.client.user.displayAvatarURL()
                    });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`payment_standard_${userId}`)
                            .setLabel('🥉 Standard - R$ 99,99')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`payment_infinity_${userId}`)
                            .setLabel('🏆 Infinity - R$ 349,99')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`payment_outros_${userId}`)
                            .setLabel('💬 Outros')
                            .setStyle(ButtonStyle.Secondary)
                    );

                // Enviar DM para o usuário
                await user.send({ embeds: [embed], components: [row] });

                // Registrar pagamento em processamento
                const paymentId = crypto.randomUUID();
                this.payments.set(paymentId, {
                    userId,
                    username: user.username,
                    plan,
                    status: 'processing',
                    timestamp: new Date()
                });

                res.json({ success: true, paymentId, message: `Painel de pagamento enviado para ${user.username} via DM!` });
            } catch (error) {
                console.error('Erro ao iniciar pagamento:', error);
                res.json({ success: false, error: `Erro ao enviar painel de pagamento: ${error.message}` });
            }
        });

        // API - Adicionar usuário (protegida)
        this.app.post('/api/add-user', authenticateToken, async (req, res) => {
            try {
                const { userId } = req.body;
                
                // Validar entrada
                if (!userId || typeof userId !== 'string') {
                    return res.json({ success: false, error: 'ID de usuário inválido' });
                }
                
                // Validar formato do ID
                if (!/^\d{17,19}$/.test(userId)) {
                    return res.json({ success: false, error: 'Formato de ID inválido' });
                }
                
                // Verificar se é o dono
                if (userId === process.env.OWNER_ID) {
                    return res.json({ success: false, error: 'O dono já tem acesso total' });
                }
                
                if (global.authorizedUsers && global.db) {
                    // Verificar se já está autorizado
                    if (global.authorizedUsers.has(userId)) {
                        return res.json({ success: false, error: 'Usuário já está autorizado' });
                    }
                    
                    // Buscar informações do usuário
                    let username = `User_${userId}`;
                    try {
                        const user = await this.client.users.fetch(userId);
                        username = user.username;
                    } catch (error) {
                        // Se não conseguir buscar, usar nome padrão
                    }
                    
                    // Adicionar ao banco primeiro
                    const success = await global.db.addAuthorizedUser(userId, username);
                    
                    if (success) {
                        // Só adicionar ao Set se foi adicionado ao banco com sucesso
                        global.authorizedUsers.add(userId);
                        res.json({ success: true, message: `Usuário ${username} adicionado com sucesso` });
                    } else {
                        res.json({ success: false, error: 'Erro ao adicionar usuário ao banco de dados' });
                    }
                } else {
                    res.json({ success: false, error: 'Sistema de usuários não disponível' });
                }
            } catch (error) {
                console.error('Erro na API add-user:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // API - Remover usuário (protegida)
        this.app.post('/api/remove-user', authenticateToken, async (req, res) => {
            try {
                const { userId } = req.body;
                
                // Validar entrada
                if (!userId || typeof userId !== 'string') {
                    return res.json({ success: false, error: 'ID de usuário inválido' });
                }
                
                // Validar formato do ID
                if (!/^\d{17,19}$/.test(userId)) {
                    return res.json({ success: false, error: 'Formato de ID inválido' });
                }
                
                // Verificar se é o dono
                if (userId === process.env.OWNER_ID) {
                    return res.json({ success: false, error: 'Não é possível remover o dono do sistema' });
                }
                
                if (global.authorizedUsers && global.db) {
                    // Verificar se está na lista
                    if (!global.authorizedUsers.has(userId)) {
                        return res.json({ success: false, error: 'Usuário não está na lista de autorizados' });
                    }
                    
                    // Buscar informações do usuário
                    let username = `User_${userId}`;
                    try {
                        const user = await this.client.users.fetch(userId);
                        username = user.username;
                    } catch (error) {
                        // Se não conseguir buscar, usar nome padrão
                    }
                    
                    // Remover do banco primeiro
                    const success = await global.db.removeAuthorizedUser(userId);
                    
                    if (success) {
                        // Só remover do Set se foi removido do banco com sucesso
                        global.authorizedUsers.delete(userId);
                        res.json({ success: true, message: `Usuário ${username} removido com sucesso` });
                    } else {
                        res.json({ success: false, error: 'Erro ao remover usuário do banco de dados' });
                    }
                } else {
                    res.json({ success: false, error: 'Sistema de usuários não disponível' });
                }
            } catch (error) {
                console.error('Erro na API remove-user:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // API - Confirmar pagamento (protegida)
        this.app.post('/api/confirm-payment', authenticateToken, async (req, res) => {
            try {
                const { paymentId } = req.body;
                
                if (!paymentId) {
                    return res.json({ success: false, error: 'ID do pagamento é obrigatório' });
                }

                const payment = this.payments.get(paymentId);
                
                if (!payment) {
                    return res.json({ success: false, error: 'Pagamento não encontrado' });
                }

                if (payment.status === 'confirmed') {
                    return res.json({ success: false, error: 'Pagamento já foi confirmado' });
                }

                if (payment.status === 'cancelled') {
                    return res.json({ success: false, error: 'Pagamento foi cancelado' });
                }

                // Atualizar status para confirmado
                payment.status = 'confirmed';
                payment.confirmedAt = new Date();
                payment.confirmedBy = req.user.username;

                // Notificar o usuário via Discord
                try {
                    const user = await this.client.users.fetch(payment.userId);
                    const { EmbedBuilder } = require('discord.js');
                    
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('✅ Pagamento Confirmado!')
                        .setDescription('Seu pagamento foi confirmado com sucesso!')
                        .addFields(
                            { name: '📋 Plano', value: payment.plan, inline: true },
                            { name: '📅 Confirmado em', value: new Date().toLocaleString('pt-BR'), inline: true }
                        )
                        .setColor('#00ff00')
                        .setTimestamp();
                    
                    await user.send({ embeds: [confirmEmbed] });
                } catch (error) {
                    console.error('Erro ao notificar usuário:', error);
                }

                res.json({ success: true, message: 'Pagamento confirmado com sucesso!' });
            } catch (error) {
                console.error('Erro ao confirmar pagamento:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // API - Cancelar pagamento (protegida)
        this.app.post('/api/cancel-payment', authenticateToken, async (req, res) => {
            try {
                const { paymentId, reason } = req.body;
                
                if (!paymentId) {
                    return res.json({ success: false, error: 'ID do pagamento é obrigatório' });
                }

                const payment = this.payments.get(paymentId);
                
                if (!payment) {
                    return res.json({ success: false, error: 'Pagamento não encontrado' });
                }

                if (payment.status === 'confirmed') {
                    return res.json({ success: false, error: 'Não é possível cancelar um pagamento já confirmado' });
                }

                if (payment.status === 'cancelled') {
                    return res.json({ success: false, error: 'Pagamento já foi cancelado' });
                }

                // Atualizar status para cancelado
                payment.status = 'cancelled';
                payment.cancelledAt = new Date();
                payment.cancelledBy = req.user.username;
                payment.cancelReason = reason || 'Sem motivo especificado';

                // Notificar o usuário via Discord
                try {
                    const user = await this.client.users.fetch(payment.userId);
                    const { EmbedBuilder } = require('discord.js');
                    
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Pagamento Cancelado')
                        .setDescription('Seu pagamento foi cancelado.')
                        .addFields(
                            { name: '📋 Plano', value: payment.plan, inline: true },
                            { name: '📅 Cancelado em', value: new Date().toLocaleString('pt-BR'), inline: true },
                            { name: '📝 Motivo', value: payment.cancelReason, inline: false }
                        )
                        .setColor('#ff0000')
                        .setTimestamp();
                    
                    await user.send({ embeds: [cancelEmbed] });
                } catch (error) {
                    console.error('Erro ao notificar usuário:', error);
                }

                res.json({ success: true, message: 'Pagamento cancelado com sucesso!' });
            } catch (error) {
                console.error('Erro ao cancelar pagamento:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // API - Apagar pagamento (protegida)
        this.app.post('/api/delete-payment', authenticateToken, async (req, res) => {
            try {
                const { paymentId } = req.body;

                if (!paymentId) {
                    return res.json({ success: false, error: 'ID do pagamento é obrigatório' });
                }

                // Verificar se o pagamento existe
                const payment = await this.dbManager.getPaymentById(paymentId);
                if (!payment) {
                    return res.json({ success: false, error: 'Pagamento não encontrado' });
                }

                // Apagar o pagamento
                await this.dbManager.deletePayment(paymentId);

                res.json({ success: true, message: 'Pagamento apagado com sucesso!' });
            } catch (error) {
                console.error('Erro ao apagar pagamento:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // === ENDPOINTS DE ATENDIMENTO ===
        this.app.post('/api/toggle-atendimento', authenticateToken, async (req, res) => {
            try {
                const { enabled } = req.body;
                global.atendimentoAtivo = enabled;
                
                // Enviar mensagem de status para o canal de atendimento
                const atendimentoChannelId = process.env.ATENDIMENTO_CHANNEL_ID;
                if (atendimentoChannelId) {
                    try {
                        const channel = await this.client.channels.fetch(atendimentoChannelId);
                        if (channel) {
                            // Se estiver desativando, primeiro tentar deletar a mensagem anterior
                            if (!enabled && global.lastAttendanceMessageId) {
                                try {
                                    const lastMessage = await channel.messages.fetch(global.lastAttendanceMessageId);
                                    if (lastMessage) {
                                        await lastMessage.delete();
                                        console.log('✅ Mensagem anterior de atendimento deletada');
                                    }
                                } catch (deleteError) {
                                    console.log('ℹ️ Não foi possível deletar a mensagem anterior (pode já ter sido deletada)');
                                }
                                global.lastAttendanceMessageId = null;
                            }
                            
                            // Enviar nova mensagem de status
                            const { EmbedBuilder } = require('discord.js');
                            const embed = new EmbedBuilder()
                                .setColor(enabled ? '#00FF00' : '#FF0000')
                                .setTitle(enabled ? '🟢 Atendimento Online' : '🔴 Atendimento Offline')
                                .setDescription(enabled ? 
                                    'O sistema de atendimento foi **ativado**!\n\n✅ Estamos online para atendê-lo!' : 
                                    'O sistema de atendimento foi **desativado**!\n\n❌ No momento estamos offline.')
                                .setTimestamp()
                                .setFooter({ 
                                    text: 'Ecstasy Brasil Bot', 
                                    iconURL: this.client.user.displayAvatarURL() 
                                });
                            
                            const sentMessage = await channel.send({ embeds: [embed] });
                            
                            // Salvar o ID da mensagem para poder deletar depois
                            if (enabled) {
                                global.lastAttendanceMessageId = sentMessage.id;
                            }
                            
                            console.log(`✅ Mensagem de atendimento ${enabled ? 'online' : 'offline'} enviada`);
                        }
                    } catch (channelError) {
                        console.error('❌ Erro ao enviar mensagem de status:', channelError);
                    }
                }
                
                res.json({ success: true });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Listar usuários (protegida)
        this.app.get('/api/users', authenticateToken, async (req, res) => {
            try {
                const users = [];
                
                // Buscar usuários do banco de dados para garantir dados atualizados
                if (global.db) {
                    const dbUsers = await global.db.getAuthorizedUsers();
                    
                    for (const dbUser of dbUsers) {
                        try {
                            const discordUser = await this.client.users.fetch(dbUser.discord_id);
                            users.push({
                                id: dbUser.discord_id,
                                username: discordUser.username,
                                discriminator: discordUser.discriminator || '0',
                                authorized_at: dbUser.authorized_at
                            });
                        } catch (error) {
                            // Se não conseguir buscar do Discord, usar dados do banco
                            users.push({
                                id: dbUser.discord_id,
                                username: dbUser.username || 'Usuário não encontrado',
                                discriminator: '0000',
                                authorized_at: dbUser.authorized_at
                            });
                        }
                    }
                    
                    // Adicionar informação do dono
                    try {
                        const owner = await this.client.users.fetch(process.env.OWNER_ID);
                        users.unshift({
                            id: process.env.OWNER_ID,
                            username: owner.username,
                            discriminator: owner.discriminator || '0',
                            authorized_at: null,
                            isOwner: true
                        });
                    } catch (error) {
                        users.unshift({
                            id: process.env.OWNER_ID,
                            username: 'Dono do Sistema',
                            discriminator: '0000',
                            authorized_at: null,
                            isOwner: true
                        });
                    }
                } else {
                    return res.json({ success: false, error: 'Sistema de banco de dados não disponível' });
                }
                
                res.json({ success: true, data: users, total: users.length });
            } catch (error) {
                console.error('Erro na API users:', error);
                res.json({ success: false, error: 'Erro interno do servidor' });
            }
        });

        // API - Listar pagamentos (protegida)
        this.app.get('/api/payments', authenticateToken, (req, res) => {
            try {
                const payments = Array.from(this.payments.entries()).map(([id, payment]) => ({
                    id,
                    ...payment
                }));
                res.json({ success: true, data: payments });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Configurações (protegida)
        this.app.get('/api/settings', authenticateToken, (req, res) => {
            try {
                const settings = {
                    atendimentoEnabled: global.atendimentoAtivo || false
                };
                res.json({ success: true, data: settings });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // API - Novos membros (protegida)
        this.app.get('/api/new-members', authenticateToken, async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                const days = parseInt(req.query.days) || null;
                
                let members;
                let totalCount;
                
                if (days) {
                    // Buscar membros dos últimos X dias
                    members = await this.dbManager.getRecentNewMembers(days);
                    totalCount = members.length;
                } else {
                    // Buscar todos os membros com paginação
                    members = await this.dbManager.getNewMembers(limit, offset);
                    totalCount = await this.dbManager.getNewMembersCount();
                }
                
                res.json({ 
                    success: true, 
                    data: {
                        members,
                        totalCount,
                        limit,
                        offset,
                        hasMore: offset + limit < totalCount
                    }
                });
            } catch (error) {
                console.error('❌ Erro ao buscar novos membros:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // API - Limpar mensagens do bot (protegida)
        this.app.post('/api/clear-bot-messages', authenticateToken, async (req, res) => {
            try {
                console.log('🧹 Iniciando limpeza de mensagens DM do bot...');
                
                if (!global.client) {
                    console.log('❌ Cliente Discord não disponível');
                    return res.json({ success: false, error: 'Cliente Discord não disponível' });
                }

                console.log('✅ Cliente Discord disponível');
                console.log('🔍 Bot ID:', global.client.user.id);
                console.log('🔍 Bot Tag:', global.client.user.tag);

                let totalDeleted = 0;
                
                // Buscar todas as DMs (canais privados) onde o bot enviou mensagens
                console.log('🔍 Buscando canais DM...');
                
                // Filtrar apenas canais DM (tipo 1 = DM)
                const dmChannels = global.client.channels.cache.filter(channel => 
                    channel.type === 1 // ChannelType.DM
                );
                
                console.log(`💬 Encontrados ${dmChannels.size} canais DM`);
                
                if (dmChannels.size === 0) {
                    console.log('ℹ️ Nenhum canal DM encontrado no cache');
                    return res.json({ 
                        success: true, 
                        message: 'Nenhum canal DM encontrado para limpar.',
                        deletedCount: 0
                    });
                }
                
                for (const dmChannel of dmChannels.values()) {
                    try {
                        console.log(`🔍 Processando DM com: ${dmChannel.recipient?.username || 'Usuário desconhecido'} (${dmChannel.id})`);
                        
                        // Buscar mensagens do canal DM
                        const messages = await dmChannel.messages.fetch({ limit: 100 });
                        console.log(`📨 Encontradas ${messages.size} mensagens na DM`);
                        
                        // Filtrar apenas mensagens do bot que são menores que 14 dias
                        const botMessages = messages.filter(msg => 
                            msg.author.id === global.client.user.id && 
                            msg.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000
                        );
                        
                        console.log(`🤖 Encontradas ${botMessages.size} mensagens do bot na DM com ${dmChannel.recipient?.username || 'Usuário desconhecido'}`);
                        
                        // Deletar mensagens do bot uma por uma
                        for (const msg of botMessages.values()) {
                            try {
                                const messagePreview = msg.content ? msg.content.substring(0, 50) : '[Embed/Anexo]';
                                console.log(`🗑️ Deletando mensagem DM: ${msg.id} - "${messagePreview}..."`);
                                
                                await msg.delete();
                                totalDeleted++;
                                console.log(`✅ Mensagem DM ${msg.id} deletada com sucesso`);
                                
                                // Pequeno delay para evitar rate limit
                                await new Promise(resolve => setTimeout(resolve, 150));
                            } catch (error) {
                                console.error(`❌ Erro ao deletar mensagem DM ${msg.id}:`, error.message);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Erro ao processar DM ${dmChannel.id}:`, error.message);
                    }
                }
                
                console.log(`🎉 Limpeza de DMs concluída! Total de mensagens deletadas: ${totalDeleted}`);
                
                res.json({ 
                    success: true, 
                    message: `${totalDeleted} mensagens DM do bot foram deletadas!`,
                    deletedCount: totalDeleted
                });
                
            } catch (error) {
                console.error('Erro na API de limpeza de DMs:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // === WEBHOOK ROUTES (existentes) ===
        
        // Webhook genérico para qualquer gateway
        this.app.post('/webhook/payment', async (req, res) => {
            try {
                console.log('🔔 Webhook recebido:', req.body);
                await this.handleGenericWebhook(req, res);
            } catch (error) {
                console.error('Erro no webhook genérico:', error);
                res.status(500).json({ error: 'Erro interno' });
            }
        });

        // Webhook específico para Mercado Pago
        this.app.post('/webhook/mercadopago', async (req, res) => {
            try {
                console.log('🔔 Webhook Mercado Pago:', req.body);
                await this.handleMercadoPagoWebhook(req, res);
            } catch (error) {
                console.error('Erro no webhook Mercado Pago:', error);
                res.status(500).json({ error: 'Erro interno' });
            }
        });

        // Webhook específico para PagSeguro
        this.app.post('/webhook/pagseguro', async (req, res) => {
            try {
                console.log('🔔 Webhook PagSeguro:', req.body);
                await this.handlePagSeguroWebhook(req, res);
            } catch (error) {
                console.error('Erro no webhook PagSeguro:', error);
                res.status(500).json({ error: 'Erro interno' });
            }
        });

        // Webhook específico para Stripe
        this.app.post('/webhook/stripe', async (req, res) => {
            try {
                console.log('🔔 Webhook Stripe:', req.body);
                await this.handleStripeWebhook(req, res);
            } catch (error) {
                console.error('Erro no webhook Stripe:', error);
                res.status(500).json({ error: 'Erro interno' });
            }
        });

        // Endpoint de teste
        this.app.get('/webhook/test', (req, res) => {
            res.json({
                status: 'OK',
                message: 'Servidor de webhook funcionando!'
            });
        });
    }

    async handleGenericWebhook(req, res) {
        const { payment_id, status, amount, customer_id, external_reference } = req.body;

        if (status === 'approved' || status === 'paid' || status === 'completed') {
            await this.confirmPayment(external_reference || payment_id, {
                gateway: 'Generic',
                amount: amount,
                customer_id: customer_id,
                webhook_data: req.body
            });
        }

        res.status(200).json({ received: true });
    }

    async handleMercadoPagoWebhook(req, res) {
        const { action, data } = req.body;

        if (action === 'payment.updated' && data && data.id) {
            // Aqui você faria uma consulta à API do Mercado Pago para obter detalhes
            // Por simplicidade, vou simular a confirmação
            const paymentData = {
                id: data.id,
                status: 'approved', // Simulado - na prática, consulte a API
                external_reference: `PAY-${data.id}` // Seu ID interno
            };

            if (paymentData.status === 'approved') {
                await this.confirmPayment(paymentData.external_reference, {
                    gateway: 'Mercado Pago',
                    mp_payment_id: data.id,
                    webhook_data: req.body
                });
            }
        }

        res.status(200).json({ received: true });
    }

    async handlePagSeguroWebhook(req, res) {
        const { notificationCode, notificationType } = req.body;

        if (notificationType === 'transaction') {
            // Aqui você consultaria a API do PagSeguro com o notificationCode
            // Por simplicidade, vou simular
            const paymentData = {
                reference: req.body.reference || `PAY-${notificationCode}`,
                status: 'Paga' // Status do PagSeguro
            };

            if (paymentData.status === 'Paga') {
                await this.confirmPayment(paymentData.reference, {
                    gateway: 'PagSeguro',
                    notification_code: notificationCode,
                    webhook_data: req.body
                });
            }
        }

        res.status(200).json({ received: true });
    }

    async handleStripeWebhook(req, res) {
        const { type, data } = req.body;

        if (type === 'payment_intent.succeeded' && data && data.object) {
            const paymentIntent = data.object;

            await this.confirmPayment(paymentIntent.metadata.payment_id, {
                gateway: 'Stripe',
                stripe_payment_id: paymentIntent.id,
                amount: paymentIntent.amount / 100, // Stripe usa centavos
                webhook_data: req.body
            });
        }

        res.status(200).json({ received: true });
    }

    // handleKirvanoWebhook removido - usando redirecionamento direto

    // handlePixGenerated removido - usando redirecionamento direto

    // handleFailedPayment simplificado - apenas para outros gateways
    async handleFailedPayment(webhookData) {
        console.log('❌ Processando pagamento falhou:', webhookData);
        
        const { gateway, event, payment_id } = webhookData;
        

        
        // Buscar pagamento nos registros para outros gateways
        const payment = this.payments.find(p => 
            p.id === payment_id || 
            p.reference === payment_id ||
            p.external_reference === payment_id
        );
        
        if (payment && payment.userId) {
            try {
                const user = await this.client.users.fetch(payment.userId);
                if (user) {
                    await user.send(`❌ **Falha no pagamento**\n\nSeu pagamento de **${payment.plan}** não foi processado. Tente novamente ou entre em contato com o suporte.`);
                    console.log(`📧 Notificação de falha enviada para ${user.tag}`);
                }
            } catch (error) {
                console.error('Erro ao notificar falha:', error);
            }
        }
    }

    // findUserByPaymentId simplificado - apenas para outros gateways
    async findUserByPaymentId(paymentId) {
        console.log(`🔍 Buscando usuário para pagamento: ${paymentId}`);
        
        // Buscar nos pagamentos pendentes para outros gateways
        const payment = this.payments.find(p => 
            p.id === paymentId || 
            p.reference === paymentId ||
            p.external_reference === paymentId
        );
        
        if (payment) {
            console.log(`✅ Usuário encontrado nos pagamentos: ${payment.userId}`);
            return payment.userId;
        }
        
        console.log(`❌ Usuário não encontrado para pagamento: ${paymentId}`);
        return null;
    }

    // sendPixInfoToUser removido - usando redirecionamento direto

    async confirmPayment(paymentId, webhookData) {
        const payment = this.payments.get(paymentId);

        if (!payment) {
            console.log(`❌ Pagamento ${paymentId} não encontrado`);
            return;
        }

        if (payment.status === 'PAGO') {
            console.log(`⚠️ Pagamento ${paymentId} já confirmado`);
            return;
        }

        // Atualiza status
        payment.status = 'PAGO';
        payment.confirmedAt = new Date();
        payment.confirmedBy = 'WEBHOOK';
        payment.webhookData = webhookData;

        console.log(`✅ Pagamento ${paymentId} confirmado via webhook`);

        try {
            const { EmbedBuilder } = require('discord.js');
            const targetUser = await this.client.users.fetch(payment.userId);
            const owner = await this.client.users.fetch(process.env.OWNER_ID);

            // Notifica o cliente
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Pagamento Confirmado Automaticamente!')
                .setDescription('Seu pagamento foi processado e confirmado com sucesso!')
                .addFields(
                    { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
                    { name: '💳 Método', value: payment.metodo, inline: true },
                    { name: '🏦 Gateway', value: webhookData.gateway, inline: true },
                    { name: '🆔 ID do Pagamento', value: paymentId, inline: false },
                    { name: '📦 Tempo de Entrega', value: 'Seu produto será entregue em até 12-24 horas dependendo do plano adquirido.', inline: false }
                )
                .setColor('#00ff00')
                .setTimestamp()
                .setFooter({
                    text: 'Confirmação Automática via Webhook',
                    iconURL: this.client.user.displayAvatarURL()
                });

            await targetUser.send({ embeds: [successEmbed] });

            // Notifica o dono
            const ownerEmbed = new EmbedBuilder()
                .setTitle('🎉 Pagamento Confirmado Automaticamente!')
                .setDescription(`Pagamento de **${targetUser.username}** confirmado via webhook!`)
                .addFields(
                    { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
                    { name: '💳 Método', value: payment.metodo, inline: true },
                    { name: '🏦 Gateway', value: webhookData.gateway, inline: true },
                    { name: '👤 Cliente', value: targetUser.username, inline: true },
                    { name: '🆔 ID', value: paymentId, inline: false },
                    { name: '📊 Status', value: '🟢 PAGO (Automático)', inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();

            await owner.send({ embeds: [ownerEmbed] });

            // Opcional: Notificar canal de vendas
            /*
            const salesChannel = this.client.channels.cache.get('ID_DO_CANAL_VENDAS');
            if (salesChannel) {
                await salesChannel.send(`🎉 **Venda confirmada automaticamente!**\n💰 R$ ${payment.valor.toFixed(2)} - ${targetUser.username}\n🏦 Via ${webhookData.gateway}`);
            }
            */

        } catch (error) {
            console.error('Erro ao notificar confirmação automática:', error);
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🌐 Servidor de webhook rodando na porta ${this.port}`);
        });
    }
}

module.exports = WebhookServer;