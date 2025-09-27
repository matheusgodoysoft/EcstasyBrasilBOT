// === IMPORTS E CONFIGURAÇÕES ===
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, Partials } = require('discord.js');
const WebhookServer = require('./webhook-server');
const DatabaseManager = require('../database/db-manager');

// === CONFIGURAÇÕES DO BOT ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

// === BANCO DE DADOS ===
const db = new DatabaseManager();

// === VARIÁVEIS GLOBAIS ===
const authorizedUsers = new Set();
const payments = new Map();
const pendingSelections = new Map();
const imageDestinationChannels = new Map();
const userSelectedPlans = new Map(); // Armazena o plano escolhido por cada usuário
let webhookServer = null;
let atendimentoAtivo = false;

// === FUNÇÕES DE VERIFICAÇÃO ===
function isOwner(userId) {
    return userId === process.env.OWNER_ID;
}

function isAuthorized(userId) {
    return isOwner(userId) || authorizedUsers.has(userId);
}

// === EVENTOS DO BOT ===
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    
    // Carrega usuários autorizados do banco
    const dbUsers = await db.getAuthorizedUsers();
    dbUsers.forEach(user => {
        authorizedUsers.add(user.discord_id);
    });
    console.log(`👥 ${authorizedUsers.size} usuários autorizados carregados do banco`);
    
    // Carrega status do atendimento
    const atendimentoStatus = await db.getSetting('atendimento_ativo');
    atendimentoAtivo = atendimentoStatus === 'true';
    
    // Iniciar backup automático (a cada 24 horas)
    db.startAutoBackup(24);
    console.log('💾 Sistema de backup automático iniciado (24h)');
    
    // Expor funções globalmente para o dashboard
    global.handlePagamentoCommand = handlePagamentoCommand;
    global.handleLimparCommand = handleLimparCommand;
    global.db = db;
    global.authorizedUsers = authorizedUsers;
    global.atendimentoAtivo = atendimentoAtivo;
    global.client = client; // Adicionar client global para API de limpeza
    
    // Inicia servidor de webhook
    webhookServer = new WebhookServer(client, payments, db);
    webhookServer.start();
});

// === EVENTO DE NOVOS MEMBROS ===
client.on('guildMemberAdd', async (member) => {
    try {
        console.log(`👋 Novo membro entrou: ${member.user.username} (${member.user.id})`);
        
        // Salvar novo membro no banco de dados
        await db.addNewMember({
            discord_id: member.user.id,
            username: member.user.username,
            display_name: member.displayName || member.user.displayName,
            avatar_url: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
            joined_at: member.joinedAt,
            account_created_at: member.user.createdAt,
            guild_id: member.guild.id,
            guild_name: member.guild.name
        });
        
        console.log(`✅ Novo membro ${member.user.username} salvo no banco de dados`);
    } catch (error) {
        console.error('❌ Erro ao salvar novo membro:', error);
    }
});

// === HANDLER DE INTERAÇÕES (BOTÕES) ===
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const customId = interaction.customId;
    
    if (customId.startsWith('payment_')) {
        const [, plan, userId] = customId.split('_');
        
        // Verifica se o usuário que clicou é o mesmo do ID no botão
        if (interaction.user.id !== userId) {
            return interaction.reply({ 
                content: '❌ Este painel não é para você!', 
                ephemeral: true 
            });
        }
        
        let paymentLink = '';
        let planName = '';
        
        if (plan === 'standard') {
            paymentLink = process.env.KIRVANO_STANDARD_PIX_LINK || 'https://pay.kirvano.com/21e3a7f0-b57c-42a6-8132-ae7cb28b7d7f';
            planName = 'Ecstasy Standard';
        } else if (plan === 'infinity') {
            paymentLink = process.env.KIRVANO_INFINITY_PIX_LINK || 'https://pay.kirvano.com/cb04d3fa-07d2-4ddd-8ebd-94e39946e613';
            planName = 'Ecstasy Infinity';
        } else if (plan === 'outros') {
            // Caso especial para negociação personalizada
            const embed = new EmbedBuilder()
                .setTitle('💬 Negociação Personalizada')
                .setDescription('Você escolheu a opção **Outros** para negociar um plano personalizado.')
                .setColor('#9b59b6')
                .addFields(
                    { name: '📞 Como proceder', value: 'Entre em contato com nossa equipe para negociar um plano que atenda suas necessidades específicas.', inline: false },
                    { name: '💼 Opções disponíveis', value: '• Planos corporativos\n• Licenças em quantidade\n• Funcionalidades específicas\n• Preços especiais', inline: false },
                    { name: '📧 Contato', value: 'Abra um ticket no servidor ou entre em contato com um administrador para iniciar a negociação.', inline: false }
                )
                .setTimestamp()
                .setFooter({
                    text: 'Ecstasy Brasil - Atendimento Personalizado',
                    iconURL: client.user.displayAvatarURL()
                });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`💳 Link de Pagamento - ${planName}`)
            .setDescription(`Clique no link abaixo para realizar o pagamento do plano **${planName}**:`)
            .setColor(plan === 'standard' ? '#3498db' : '#f39c12')
            .addFields(
                { name: '🔗 Link de Pagamento', value: `[Clique aqui para pagar](${paymentLink})`, inline: false },
                { name: '📋 Instruções', value: '1. Clique no link acima\n2. Preencha seus dados\n3. Realize o pagamento\n4. **Após o pagamento, envie:** `!comprovante` seguido da imagem\n\n💡 **Dica:** Você pode opcionalmente escolher o plano com `!plano standard` ou `!plano infinity` antes de enviar o comprovante.', inline: false }
            )
            .setTimestamp()
            .setFooter({
                text: 'Ecstasy Brasil - Pagamento Seguro',
                iconURL: client.user.displayAvatarURL()
            });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// === HANDLER DE MENSAGENS ===
client.on('messageCreate', async (message) => {
    console.log(`📨 Mensagem recebida de ${message.author.tag} (${message.author.id}): "${message.content}"`);
    console.log(`📍 Canal: ${message.guild ? 'Servidor' : 'DM'}`);
    
    // Ignora mensagens do próprio bot
    if (message.author.bot) {
        console.log('🤖 Ignorando mensagem do bot');
        return;
    }
    
    // Só processa DMs
    if (message.guild) {
        console.log('🏠 Ignorando mensagem de servidor (só DMs)');
        return;
    }
    
    // Verifica se é um comando (começa com !)
    if (!message.content.startsWith('!')) {
        console.log('📝 Não é comando, verificando imagens...');
        // Se não é comando, verifica se é imagem ou comprovante
        if (hasImageAttachments(message)) {
            // Verifica se é comprovante de pagamento
            if (isPaymentProof(message)) {
                await forwardPaymentProof(message);
            } else {
                // Encaminha imagem normal se canal configurado
                const channelId = imageDestinationChannels.get(message.author.id);
                if (channelId) {
                    await forwardImageToChannel(message, channelId);
                }
            }
        }
        return;
    }
    
    console.log(`🔐 Verificando autorização para usuário ${message.author.id}`);
    console.log(`👑 É owner? ${isOwner(message.author.id)}`);
    console.log(`👥 Usuários autorizados: ${Array.from(authorizedUsers).join(', ')}`);
    
    // Verifica autorização
    if (!isAuthorized(message.author.id)) {
        console.log('❌ Usuário não autorizado');
        return message.reply('❌ Você não tem permissão para usar este bot!');
    }
    
    console.log('✅ Usuário autorizado, processando comando...');
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args[0].toLowerCase();
    
    // === COMANDOS ===
    switch (command) {
        case 'help':
            await handleHelpCommand(message);
            break;
        case 'send':
            await handleSendCommand(message, args);
            break;
        case 'dm':
            await handleDmCommand(message, args);
            break;
        case 'pagamento':
            await handlePagamentoCommand(message, args);
            break;
        case 'payment':
            await handlePaymentCommand(message, args);
            break;
        case 'checkpayment':
            await handleCheckPaymentCommand(message, args);
            break;
        case 'confirmpayment':
            await handleConfirmPaymentCommand(message, args);
            break;
        case 'payments':
            await handlePaymentsListCommand(message);
            break;
        case 'webhook':
            await handleWebhookCommand(message, args);
            break;
        case 'testwebhook':
            await handleTestWebhookCommand(message, args);
            break;
        case 'vendas':
            await handleVendasCommand(message);
            break;
        case 'clientes':
            await handleClientesCommand(message);
            break;
        case 'status':
            await handleStatusCommand(message);
            break;
        case 'addcliente':
            await handleAddClienteCommand(message, args);
            break;
        case 'adduser':
            await handleAddUserCommand(message, args);
            break;
        case 'removeuser':
            await handleRemoveUserCommand(message, args);
            break;
        case 'listusers':
            await handleListUsersCommand(message);
            break;
        case 'setimage':
            await handleSetImageChannelCommand(message, args);
            break;
        case 'atendimento':
            if (args[1] === 'on') {
                await handleAtendimentoOnCommand(message);
            } else if (args[1] === 'off') {
                await handleAtendimentoOffCommand(message);
            } else {
                await message.reply('❌ Use: `!atendimento on` ou `!atendimento off`');
            }
            break;
        case 'plano':
            await handlePlanoCommand(message, args);
            break;
        case 'comprovante':
            await handleComprovanteCommand(message);
            break;
        case 'limpar':
            await handleLimparCommand(message, args);
            break;
        case 'backup':
            await handleBackupCommand(message, args);
            break;
        case 'restore':
            await handleRestoreCommand(message, args);
            break;
        case 'backups':
            await handleBackupsListCommand(message);
            break;
        default:
            await message.reply('❌ Comando não reconhecido! Use `!help` para ver os comandos disponíveis.');
    }
});

// === FUNÇÕES DE COMANDO ===
async function handleHelpCommand(message) {
    const embed = new EmbedBuilder()
        .setTitle('🤖 Comandos Disponíveis')
        .setDescription('Lista de todos os comandos do bot')
        .addFields(
            {
                name: '📊 Sistema de Keys',
                value: '`!keys` - Mostra quantidade de keys disponíveis\n`!keys <número>` - Define quantidade de keys vendidas (ex: !keys 20)',
                inline: false
            },
            {
                name: '📤 Envio',
                value: '`!send <#canal> <mensagem>` - Envia mensagem para canal\n`!dm <@usuário> <mensagem>` - Envia DM para usuário\n\n**💡 Dica:** Você pode anexar imagens junto com o comando !send',
                inline: false
            },
            {
                name: '💰 Sistema de Pagamentos',
                value: '`!pagamento <@usuário>` - Inicia processo de pagamento\n`!payment <@usuário>` - Sistema de pagamento alternativo\n`!checkpayment <id>` - Verifica status de pagamento\n`!confirmpayment <id>` - Confirma pagamento manualmente\n`!payments` - Lista todos os pagamentos',
                inline: false
            },
            {
                name: '📈 Relatórios',
                value: '`!vendas` - Relatório de vendas\n`!clientes` - Relatório de clientes\n`!status` - Status geral do sistema',
                inline: false
            },
            {
                name: '👥 Gerenciamento (Dono)',
                value: '`!adduser <@usuário>` - Autoriza usuário\n`!removeuser <@usuário>` - Remove autorização\n`!listusers` - Lista usuários autorizados\n`!addcliente <@usuário> <plano> <dias>` - Adiciona cliente manualmente',
                inline: false
            },
            {
                name: '🌐 Webhook',
                value: '`!webhook` - Informações do webhook\n`!testwebhook <id>` - Testa webhook',
                inline: false
            },
            {
                name: '📸 Imagens',
                value: '`!setimage <#canal>` - Define canal para suas imagens',
                inline: false
            },
            {
                name: '🎧 Atendimento',
                value: '`!atendimento on/off` - Liga/desliga sistema de atendimento',
                inline: false
            },
            {
                name: '💎 Planos',
                value: '`!plano standard` ou `!plano infinity` - Seleciona seu plano antes de enviar comprovante',
                inline: false
            },
            {
                name: '🧹 Moderação',
                value: '`!limpar` - Limpa todas as mensagens do bot no canal\n`!limpar <@usuário>` - Limpa mensagens de um usuário específico',
                inline: false
            },
            {
                name: '💾 Backup (Dono)',
                value: '`!backup` - Menu de backup\n`!backup create` - Criar backup manual\n`!backup status` - Status do backup automático\n`!backups` - Listar backups\n`!restore <arquivo>` - Restaurar backup',
                inline: false
            }
        )
        .setColor('#5865F2')
        .setTimestamp()
        .setFooter({
            text: 'Bot Ecstasy Brasil',
            iconURL: client.user.displayAvatarURL()
        });
    
    await message.reply({ embeds: [embed] });
}

// === OUTRAS FUNÇÕES DE COMANDO (continuação do arquivo original) ===
async function handleSendCommand(message, args) {
    if (args.length < 3) {
        return message.reply('❌ Uso correto: `!send <#canal> <mensagem>`\nExemplo: `!send #geral Olá pessoal!`');
    }
    
    const channelMention = args[1];
    const messageContent = args.slice(2).join(' ');
    
    const channelId = channelMention.replace(/[<#>]/g, '');
    const targetChannel = client.channels.cache.get(channelId);
    
    if (!targetChannel) {
        return message.reply('❌ Canal não encontrado! Verifique se o bot tem acesso ao canal.');
    }
    
    try {
        // Preparar o objeto de envio
        const messageOptions = { content: messageContent };
        
        // Verificar se há anexos (imagens) na mensagem original
        if (message.attachments.size > 0) {
            const files = [];
            message.attachments.forEach(attachment => {
                files.push({
                    attachment: attachment.url,
                    name: attachment.name
                });
            });
            messageOptions.files = files;
        }
        
        await targetChannel.send(messageOptions);
        await message.reply(`✅ Mensagem enviada para ${targetChannel.name} em ${targetChannel.guild.name}!`);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        await message.reply('❌ Erro ao enviar mensagem. Verifique as permissões do bot.');
    }
}

async function handleDmCommand(message, args) {
    if (args.length < 3) {
        return message.reply('❌ Uso correto: `!dm <@usuário> <mensagem>`\nExemplo: `!dm @João Olá!`');
    }
    
    const userMention = args[1];
    const messageContent = args.slice(2).join(' ');
    
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
            .setDescription(messageContent)
            .setColor('#5865F2')
            .setAuthor({
                name: 'Mensagem da Administração',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp()
            .setFooter({
                text: 'Ecstasy Brasil Bot',
                iconURL: client.user.displayAvatarURL()
            });
        
        await targetUser.send({ embeds: [embed] });
        await message.reply(`✅ Mensagem enviada para ${targetUser.username}!`);
    } catch (error) {
        console.error('Erro ao enviar DM:', error);
        await message.reply('❌ Erro ao enviar mensagem. Usuário pode ter DMs desabilitadas.');
    }
}

// === FUNÇÕES DE PAGAMENTO ===
async function handlePagamentoCommand(message, args) {
    if (!isAuthorized(message.author.id)) {
        return message.reply('❌ Você não tem permissão para usar este comando.');
    }
    
    if (args.length < 2) {
        return message.reply('❌ Uso: `!pagamento <@usuário>`');
    }
    
    // Extrai o ID do usuário mencionado
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('💎 Escolha seu Plano - Ecstasy Brasil')
            .setDescription(`Olá ${targetUser.username}! Escolha o plano que melhor se adequa às suas necessidades:`)
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
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp()
            .setFooter({
                text: 'Ecstasy Brasil - Sistema de Pagamento',
                iconURL: client.user.displayAvatarURL()
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

        await targetUser.send({ embeds: [embed], components: [row] });
        await message.reply(`✅ Painel de pagamento enviado para ${targetUser.username} via DM!`);
        
    } catch (error) {
        console.error('Erro ao enviar painel de pagamento:', error);
        await message.reply('❌ Erro ao enviar painel de pagamento. Verifique se o usuário permite DMs.');
    }
}

async function handlePaymentCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso: `!payment <create|list|check|confirm>`');
    }
    
    const action = args[1].toLowerCase();
    
    switch (action) {
        case 'create':
            await createPayment(message, args.slice(2));
            break;
        case 'list':
            await handlePaymentsListCommand(message);
            break;
        case 'check':
            await handleCheckPaymentCommand(message, args.slice(2));
            break;
        case 'confirm':
            await handleConfirmPaymentCommand(message, args.slice(2));
            break;
        default:
            await message.reply('❌ Ações disponíveis: create, list, check, confirm');
    }
}

async function createPayment(message, args) {
    if (!hasKeysAvailable()) {
        return message.reply('❌ Não há mais keys disponíveis para esta semana! Use `!keys` para verificar o status.');
    }
    
    const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const payment = {
        paymentId,
        userId: message.author.id,
        username: message.author.username,
        valor: 25.00, // Valor padrão
        metodo: 'PIX',
        status: 'PENDENTE',
        createdAt: new Date(),
        plano: 'Standard'
    };
    
    payments.set(paymentId, payment);
    
    const embed = new EmbedBuilder()
        .setTitle('💳 Pagamento Criado')
        .setDescription('Seu pagamento foi registrado no sistema!')
        .addFields(
            { name: '🆔 ID', value: paymentId, inline: false },
            { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
            { name: '💳 Método', value: payment.metodo, inline: true },
            { name: '📊 Status', value: payment.status, inline: true }
        )
        .setColor('#ffa500')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function handleCheckPaymentCommand(message, args) {
    if (args.length < 1) {
        return message.reply('❌ Uso: `!checkpayment <ID>`');
    }
    
    const paymentId = args[0];
    const payment = payments.get(paymentId);
    
    if (!payment) {
        return message.reply('❌ Pagamento não encontrado!');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('💳 Status do Pagamento')
        .addFields(
            { name: '🆔 ID', value: payment.paymentId, inline: false },
            { name: '👤 Cliente', value: payment.username, inline: true },
            { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
            { name: '📊 Status', value: payment.status, inline: true },
            { name: '📅 Criado em', value: payment.createdAt.toLocaleString('pt-BR'), inline: false }
        )
        .setColor(payment.status === 'PAGO' ? '#00ff00' : '#ffa500')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function handleConfirmPaymentCommand(message, args) {
    if (args.length < 1) {
        return message.reply('❌ Uso: `!confirmpayment <ID>`');
    }
    
    const paymentId = args[0];
    const payment = payments.get(paymentId);
    
    if (!payment) {
        return message.reply('❌ Pagamento não encontrado!');
    }
    
    if (payment.status === 'PAGO') {
        return message.reply('❌ Este pagamento já foi confirmado!');
    }
    
    payment.status = 'PAGO';
    payment.confirmedAt = new Date();
    payment.confirmedBy = message.author.id;
    
    // Incrementa contador de keys
    await incrementKeysSold();
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Pagamento Confirmado')
        .setDescription('Pagamento confirmado com sucesso!')
        .addFields(
            { name: '🆔 ID', value: payment.paymentId, inline: false },
            { name: '👤 Cliente', value: payment.username, inline: true },
            { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
            { name: '📅 Confirmado em', value: new Date().toLocaleString('pt-BR'), inline: false }
        )
        .setColor('#00ff00')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Notifica o cliente
    try {
        const customer = await client.users.fetch(payment.userId);
        const customerEmbed = new EmbedBuilder()
            .setTitle('✅ Pagamento Confirmado!')
            .setDescription('Seu pagamento foi confirmado! Você receberá seu acesso em breve.')
            .addFields(
                { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
                { name: '🆔 ID', value: payment.paymentId, inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await customer.send({ embeds: [customerEmbed] });
    } catch (error) {
        console.error('Erro ao notificar cliente:', error);
    }
}

async function handlePaymentsListCommand(message) {
    if (payments.size === 0) {
        return message.reply('📋 Nenhum pagamento registrado.');
    }
    
    const paymentsList = Array.from(payments.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);
    
    const embed = new EmbedBuilder()
        .setTitle('💳 Lista de Pagamentos')
        .setDescription(`Mostrando os ${paymentsList.length} pagamentos mais recentes`)
        .setColor('#5865F2')
        .setTimestamp();
    
    paymentsList.forEach((payment, index) => {
        embed.addFields({
            name: `${index + 1}. ${payment.username}`,
            value: `**ID:** ${payment.paymentId}\n**Valor:** R$ ${payment.valor.toFixed(2)}\n**Status:** ${payment.status}\n**Data:** ${payment.createdAt.toLocaleString('pt-BR')}`,
            inline: true
        });
    });
    
    await message.reply({ embeds: [embed] });
}

// === FUNÇÕES DE WEBHOOK ===
async function handleWebhookCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso: `!webhook <start|stop|status>`');
    }
    
    const action = args[1].toLowerCase();
    
    switch (action) {
        case 'start':
            if (webhookServer) {
                return message.reply('⚠️ Servidor de webhook já está rodando!');
            }
            
            webhookServer = new WebhookServer(client, payments, db);
            webhookServer.start();
            await message.reply('✅ Servidor de webhook iniciado!');
            break;
            
        case 'stop':
            if (!webhookServer) {
                return message.reply('⚠️ Servidor de webhook não está rodando!');
            }
            
            webhookServer.stop();
            webhookServer = null;
            await message.reply('🔴 Servidor de webhook parado!');
            break;
            
        case 'status':
            const status = webhookServer ? '🟢 Online' : '🔴 Offline';
            const port = process.env.WEBHOOK_PORT || 3000;
            
            const embed = new EmbedBuilder()
                .setTitle('🌐 Status do Webhook')
                .addFields(
                    { name: '📊 Status', value: status, inline: true },
                    { name: '🔌 Porta', value: port.toString(), inline: true },
                    { name: '📡 Endpoints', value: webhookServer ? 
                        `• GET /\n• POST /webhook/kirvano\n• POST /webhook/payment\n• POST /test/payment/:id` : 
                        'Servidor offline', inline: false }
                )
                .setColor(webhookServer ? '#00ff00' : '#ff0000')
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
            break;
            
        default:
            await message.reply('❌ Ações disponíveis: start, stop, status');
    }
}

async function handleTestWebhookCommand(message, args) {
    if (args.length < 1) {
        return message.reply('❌ Uso: `!testwebhook <payment_id>`');
    }
    
    const paymentId = args[0];
    const payment = payments.get(paymentId);
    
    if (!payment) {
        return message.reply('❌ Pagamento não encontrado!');
    }
    
    if (!webhookServer) {
        return message.reply('❌ Servidor de webhook não está rodando! Use `!webhook start`');
    }
    
    try {
        const port = process.env.WEBHOOK_PORT || 3000;
        const testUrl = `http://localhost:${port}/test/payment/${paymentId}`;
        
        // Simula chamada do webhook
        const response = await fetch(testUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: true })
        });
        
        if (response.ok) {
            await message.reply(`✅ Webhook testado com sucesso para pagamento ${paymentId}!`);
        } else {
            await message.reply(`❌ Erro no teste do webhook: ${response.status}`);
        }
    } catch (error) {
        console.error('Erro no teste do webhook:', error);
        await message.reply('❌ Erro ao testar webhook!');
    }
}

// === FUNÇÕES DE RELATÓRIOS ===
async function handleVendasCommand(message) {
    const totalPayments = payments.size;
    const paidPayments = Array.from(payments.values()).filter(p => p.status === 'PAGO');
    const pendingPayments = Array.from(payments.values()).filter(p => p.status === 'PENDENTE');
    const totalRevenue = paidPayments.reduce((sum, p) => sum + p.valor, 0);
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Relatório de Vendas')
        .addFields(
            { name: '💰 Receita Total', value: `R$ ${totalRevenue.toFixed(2)}`, inline: true },
            { name: '✅ Pagamentos Confirmados', value: paidPayments.length.toString(), inline: true },
            { name: '⏳ Pagamentos Pendentes', value: pendingPayments.length.toString(), inline: true },
            { name: '📈 Total de Transações', value: totalPayments.toString(), inline: true },
            { name: '🔑 Keys Vendidas', value: `${keysSystem.sold_count}/${keysSystem.total_limit}`, inline: true },
            { name: '📊 Taxa de Conversão', value: totalPayments > 0 ? `${((paidPayments.length / totalPayments) * 100).toFixed(1)}%` : '0%', inline: true }
        )
        .setColor('#00ff88')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function handleClientesCommand(message) {
    const uniqueCustomers = new Set(Array.from(payments.values()).map(p => p.userId));
    const paidCustomers = new Set(Array.from(payments.values()).filter(p => p.status === 'PAGO').map(p => p.userId));
    
    const embed = new EmbedBuilder()
        .setTitle('👥 Relatório de Clientes')
        .addFields(
            { name: '👤 Total de Clientes', value: uniqueCustomers.size.toString(), inline: true },
            { name: '✅ Clientes Pagantes', value: paidCustomers.size.toString(), inline: true },
            { name: '⏳ Clientes Pendentes', value: (uniqueCustomers.size - paidCustomers.size).toString(), inline: true }
        )
        .setColor('#5865F2')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function handleStatusCommand(message) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const embed = new EmbedBuilder()
        .setTitle('🤖 Status do Bot')
        .addFields(
            { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
            { name: '🌐 Webhook', value: webhookServer ? '🟢 Online' : '🔴 Offline', inline: true },
            { name: '🔑 Keys', value: `${keysSystem.sold_count}/${keysSystem.total_limit} vendidas`, inline: true },
            { name: '💳 Pagamentos', value: payments.size.toString(), inline: true },
            { name: '👥 Usuários Autorizados', value: (authorizedUsers.size + 1).toString(), inline: true },
            { name: '🎯 Atendimento', value: atendimentoAtivo ? '🟢 Ativo' : '🔴 Inativo', inline: true }
        )
        .setColor('#00ff88')
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

// === FUNÇÕES DE GERENCIAMENTO ===
async function handleAddClienteCommand(message, args) {
    if (args.length < 3) {
        return message.reply('❌ Uso: `!addcliente <@usuário> <valor> [plano]`');
    }
    
    const userMention = args[1];
    const valor = parseFloat(args[2]);
    const plano = args[3] || 'Standard';
    
    if (isNaN(valor) || valor <= 0) {
        return message.reply('❌ Valor inválido!');
    }
    
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const user = await client.users.fetch(userId);
        
        const paymentId = `MANUAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const payment = {
            paymentId,
            userId: user.id,
            username: user.username,
            valor: valor,
            metodo: 'Manual',
            status: 'PAGO',
            plano: plano,
            createdAt: new Date(),
            confirmedAt: new Date(),
            confirmedBy: message.author.id,
            manual: true
        };
        
        payments.set(paymentId, payment);
        await incrementKeysSold();
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Cliente Adicionado')
            .addFields(
                { name: '👤 Cliente', value: user.username, inline: true },
                { name: '💰 Valor', value: `R$ ${valor.toFixed(2)}`, inline: true },
                { name: '💎 Plano', value: plano, inline: true },
                { name: '🆔 ID', value: paymentId, inline: false }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        
        // Notifica o cliente
        const customerEmbed = new EmbedBuilder()
            .setTitle('🎉 Bem-vindo!')
            .setDescription('Você foi adicionado manualmente ao sistema!')
            .addFields(
                { name: '💎 Plano', value: plano, inline: true },
                { name: '💰 Valor', value: `R$ ${valor.toFixed(2)}`, inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await user.send({ embeds: [customerEmbed] });
        
    } catch (error) {
        console.error('Erro ao adicionar cliente:', error);
        await message.reply('❌ Erro ao adicionar cliente!');
    }
}

async function handleAddUserCommand(message, args) {
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono pode adicionar usuários autorizados!');
    }
    
    if (args.length < 2) {
        return message.reply('❌ Uso: `!adduser <@usuário>` ou `!adduser <ID>`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    // Validar se é um ID válido
    if (!/^\d{17,19}$/.test(userId)) {
        return message.reply('❌ ID de usuário inválido! Use `!adduser <@usuário>` ou `!adduser <ID>`');
    }
    
    // Verificar se já está autorizado
    if (authorizedUsers.has(userId)) {
        return message.reply('❌ Este usuário já está autorizado!');
    }
    
    // Verificar se é o próprio dono
    if (userId === process.env.OWNER_ID) {
        return message.reply('❌ O dono já tem acesso total ao sistema!');
    }
    
    try {
        const user = await client.users.fetch(userId);
        
        // Adicionar ao banco de dados primeiro
        const success = await db.addAuthorizedUser(userId, user.username);
        
        if (success) {
            // Só adicionar ao Set se foi salvo no banco com sucesso
            authorizedUsers.add(userId);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Usuário Autorizado')
                .setDescription(`${user.username} foi adicionado aos usuários autorizados!`)
                .addFields(
                    { name: '👤 Usuário', value: user.username, inline: true },
                    { name: '🆔 ID', value: userId, inline: true },
                    { name: '📊 Total de Usuários', value: `${authorizedUsers.size}`, inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp()
                .setThumbnail(user.displayAvatarURL());
            
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply('❌ Erro ao salvar usuário no banco de dados!');
        }
    } catch (error) {
        console.error('Erro ao adicionar usuário:', error);
        if (error.code === 10013) {
            await message.reply('❌ Usuário não encontrado! Verifique se o ID está correto.');
        } else {
            await message.reply('❌ Erro ao buscar usuário. Tente novamente.');
        }
    }
}

async function handleRemoveUserCommand(message, args) {
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono pode remover usuários autorizados!');
    }
    
    if (args.length < 2) {
        return message.reply('❌ Uso: `!removeuser <@usuário>` ou `!removeuser <ID>`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    // Validar se é um ID válido
    if (!/^\d{17,19}$/.test(userId)) {
        return message.reply('❌ ID de usuário inválido! Use `!removeuser <@usuário>` ou `!removeuser <ID>`');
    }
    
    // Verificar se é o próprio dono
    if (userId === process.env.OWNER_ID) {
        return message.reply('❌ Não é possível remover o dono do sistema!');
    }
    
    // Verificar se está na lista de autorizados
    if (!authorizedUsers.has(userId)) {
        return message.reply('❌ Este usuário não está na lista de autorizados!');
    }
    
    try {
        // Remover do banco de dados primeiro
        const success = await db.removeAuthorizedUser(userId);
        
        if (success) {
            // Só remover do Set se foi removido do banco com sucesso
            authorizedUsers.delete(userId);
            
            let username = 'Usuário';
            try {
                const user = await client.users.fetch(userId);
                username = user.username;
            } catch (error) {
                // Se não conseguir buscar o usuário, usar ID
                username = `ID: ${userId}`;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Usuário Removido')
                .setDescription(`${username} foi removido dos usuários autorizados!`)
                .addFields(
                    { name: '👤 Usuário', value: username, inline: true },
                    { name: '🆔 ID', value: userId, inline: true },
                    { name: '📊 Total de Usuários', value: `${authorizedUsers.size}`, inline: true }
                )
                .setColor('#ff4444')
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply('❌ Erro ao remover usuário do banco de dados!');
        }
    } catch (error) {
        console.error('Erro ao remover usuário:', error);
        await message.reply('❌ Erro interno ao remover usuário. Tente novamente.');
    }
}

async function handleListUsersCommand(message) {
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono pode listar usuários autorizados!');
    }
    
    try {
        // Buscar usuários do banco de dados para garantir dados atualizados
        const dbUsers = await db.getAuthorizedUsers();
        
        if (dbUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📋 Lista de Usuários Autorizados')
                .setDescription('Nenhum usuário autorizado encontrado.')
                .addFields(
                    { name: '👑 Dono', value: `<@${process.env.OWNER_ID}>`, inline: false }
                )
                .setColor('#ffa500')
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        // Criar lista de usuários com informações detalhadas
        const userList = [];
        
        for (const user of dbUsers) {
            let username = 'Usuário Desconhecido';
            try {
                const discordUser = await client.users.fetch(user.discord_id);
                username = discordUser.username;
            } catch (error) {
                // Se não conseguir buscar, usar o username do banco ou ID
                username = user.username || `ID: ${user.discord_id}`;
            }
            
            const authorizedDate = user.authorized_at ? 
                new Date(user.authorized_at).toLocaleDateString('pt-BR') : 
                'Data não disponível';
            
            userList.push({
                name: `👤 ${username}`,
                value: `**ID:** ${user.discord_id}\n**Autorizado em:** ${authorizedDate}`,
                inline: true
            });
        }
        
        // Dividir em múltiplos embeds se necessário (máximo 25 fields por embed)
        const embedsToSend = [];
        const maxFieldsPerEmbed = 24; // Deixar espaço para o campo do dono
        
        for (let i = 0; i < userList.length; i += maxFieldsPerEmbed) {
            const currentFields = userList.slice(i, i + maxFieldsPerEmbed);
            
            const embed = new EmbedBuilder()
                .setTitle(`📋 Lista de Usuários Autorizados (${i + 1}-${Math.min(i + maxFieldsPerEmbed, userList.length)} de ${userList.length})`)
                .setDescription(`Total de usuários autorizados: **${userList.length}**`)
                .addFields(currentFields)
                .setColor('#00ff00')
                .setTimestamp();
            
            // Adicionar informação do dono apenas no primeiro embed
            if (i === 0) {
                embed.addFields({ 
                    name: '👑 Dono do Sistema', 
                    value: `<@${process.env.OWNER_ID}> (Acesso total)`, 
                    inline: false 
                });
            }
            
            embedsToSend.push(embed);
        }
        
        // Enviar todos os embeds
        for (const embed of embedsToSend) {
            await message.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        await message.reply('❌ Erro interno ao buscar lista de usuários. Tente novamente.');
    }
}

async function handleSetImageChannelCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso: `!setimage <#canal>`');
    }
    
    const channelMention = args[1];
    const channelId = channelMention.replace(/[<#>]/g, '');
    
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        return message.reply('❌ Canal não encontrado!');
    }
    
    imageDestinationChannels.set(message.author.id, channelId);
    await message.reply(`✅ Canal de imagens definido para ${channel.name}!`);
}

async function handleAtendimentoOnCommand(message) {
    atendimentoAtivo = true;
    await message.reply('✅ Sistema de atendimento ativado!');
    
    // Enviar notificação para o canal de atendimento
    const atendimentoChannelId = process.env.ATENDIMENTO_CHANNEL_ID;
    if (atendimentoChannelId) {
        try {
            const channel = await client.channels.fetch(atendimentoChannelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🟢 Atendimento Online')
                    .setDescription('O sistema de atendimento foi **ativado**!')
                    .setTimestamp()
                    .setFooter({ text: 'Ecstasy Brasil Bot', iconURL: client.user.displayAvatarURL() });
                
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erro ao enviar notificação de atendimento online:', error);
        }
    }
}

async function handleAtendimentoOffCommand(message) {
    atendimentoAtivo = false;
    await message.reply('🔴 Sistema de atendimento desativado!');
    
    // Enviar notificação para o canal de atendimento
    const atendimentoChannelId = process.env.ATENDIMENTO_CHANNEL_ID;
    if (atendimentoChannelId) {
        try {
            const channel = await client.channels.fetch(atendimentoChannelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔴 Atendimento Offline')
                    .setDescription('O sistema de atendimento foi **desativado**!')
                    .setTimestamp()
                    .setFooter({ text: 'Ecstasy Brasil Bot', iconURL: client.user.displayAvatarURL() });
                
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erro ao enviar notificação de atendimento offline:', error);
        }
    }
}

// === FUNÇÕES AUXILIARES ===
function hasImageAttachments(message) {
    return message.attachments.size > 0 && 
           message.attachments.some(attachment => 
               attachment.contentType && attachment.contentType.startsWith('image/'));
}

function isPaymentProof(message) {
    const content = message.content.toLowerCase();
    const keywords = ['comprovante', 'pagamento', 'pix', 'transferencia', 'pago'];
    return keywords.some(keyword => content.includes(keyword));
}

async function forwardPaymentProof(message) {
    if (!process.env.PAYMENT_CHANNEL_ID) return;
    
    try {
        const channel = client.channels.cache.get(process.env.PAYMENT_CHANNEL_ID);
        if (!channel) return;
        
        // Busca o plano selecionado pelo usuário (opcional)
        const selectedPlan = userSelectedPlans.get(message.author.id) || 'Não informado';
        
        const embed = new EmbedBuilder()
            .setTitle('💳 Comprovante de Pagamento Recebido')
            .setDescription(`**Cliente:** ${message.author.username}\n**ID:** ${message.author.id}`)
            .setColor('#ffa500')
            .addFields(
                { name: '👤 Nome do Usuário', value: message.author.username, inline: true },
                { name: '💎 Plano Escolhido', value: selectedPlan, inline: true },
                { name: '🆔 ID do Cliente', value: message.author.id, inline: true }
            )
            .setTimestamp();
        
        if (message.content) {
            embed.addFields({ name: '💬 Mensagem', value: message.content, inline: false });
        }
        
        const files = message.attachments.map(attachment => attachment.url);
        
        await channel.send({ embeds: [embed], files: files });
        await message.reply('✅ Comprovante recebido! Nossa equipe irá verificar em breve.');
        
    } catch (error) {
        console.error('Erro ao encaminhar comprovante:', error);
    }
}

async function handlePlanoCommand(message, args) {
    if (!args[1]) {
        return message.reply('❌ Use: `!plano standard` ou `!plano infinity`');
    }
    
    const plano = args[1].toLowerCase();
    
    if (plano !== 'standard' && plano !== 'infinity') {
        return message.reply('❌ Planos disponíveis: `standard` ou `infinity`');
    }
    
    // Armazena o plano escolhido pelo usuário
    userSelectedPlans.set(message.author.id, plano.charAt(0).toUpperCase() + plano.slice(1));
    
    const embed = new EmbedBuilder()
        .setTitle('💎 Plano Selecionado')
        .setDescription(`Você selecionou o plano **${plano.charAt(0).toUpperCase() + plano.slice(1)}**!`)
        .setColor('#00ff00')
        .addFields(
            { name: '📋 Próximo Passo', value: 'Agora você pode enviar seu comprovante de pagamento como imagem.', inline: false },
            { name: '💡 Dica', value: 'Inclua palavras como "comprovante", "pagamento" ou "pix" na mensagem junto com a imagem.', inline: false }
        )
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function handleComprovanteCommand(message) {
    // Verifica se há imagem anexada
    if (message.attachments.size === 0) {
        return message.reply('❌ Por favor, anexe uma imagem do comprovante junto com o comando `!comprovante`.');
    }
    
    // Verifica se há pelo menos uma imagem
    const hasImage = message.attachments.some(attachment => 
        attachment.contentType && attachment.contentType.startsWith('image/')
    );
    
    if (!hasImage) {
        return message.reply('❌ Por favor, anexe uma imagem válida do comprovante.');
    }
    
    // Encaminha o comprovante diretamente (sem verificar plano)
    await forwardPaymentProof(message);
}

async function handleLimparCommand(message, args) {
    // Verificar se o usuário tem permissão (deve ser autorizado)
    if (!authorizedUsers.has(message.author.id)) {
        await message.reply('❌ Você não tem permissão para usar este comando!');
        return;
    }

    try {
        if (args.length === 0) {
            // !limpar - limpa todas as mensagens do bot no canal
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(msg => 
                msg.author.id === client.user.id && 
                msg.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000
            );
            
            if (botMessages.size === 0) {
                await message.reply('❌ Não há mensagens do bot para deletar (mensagens devem ter menos de 14 dias).');
                return;
            }

            // Deletar mensagens do bot uma por uma
            let deletedCount = 0;
            for (const msg of botMessages.values()) {
                try {
                    await msg.delete();
                    deletedCount++;
                } catch (error) {
                    console.error('Erro ao deletar mensagem do bot:', error);
                }
            }

            const confirmMsg = await message.channel.send(`✅ ${deletedCount} mensagens do bot foram deletadas!`);
            
            // Deletar a mensagem de confirmação após 3 segundos
            setTimeout(() => {
                confirmMsg.delete().catch(() => {});
            }, 3000);

        } else {
            // !limpar <usuario> - limpa mensagens de um usuário específico
            const targetUser = args[0].replace(/[<@!>]/g, ''); // Remove menção se houver
            
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => 
                msg.author.id === targetUser && 
                msg.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000
            );
            
            if (userMessages.size === 0) {
                await message.reply('❌ Não foram encontradas mensagens deste usuário para deletar.');
                return;
            }

            // Deletar mensagens uma por uma (para evitar problemas com bulk delete)
            let deletedCount = 0;
            for (const msg of userMessages.values()) {
                try {
                    await msg.delete();
                    deletedCount++;
                } catch (error) {
                    console.error('Erro ao deletar mensagem:', error);
                }
            }

            const confirmMsg = await message.channel.send(`✅ ${deletedCount} mensagens do usuário foram deletadas!`);
            
            // Deletar a mensagem de confirmação após 3 segundos
            setTimeout(() => {
                confirmMsg.delete().catch(() => {});
            }, 3000);
        }

    } catch (error) {
        console.error('Erro no comando limpar:', error);
        await message.reply('❌ Erro ao executar o comando de limpeza!');
    }
}

// === FUNÇÕES DE BACKUP ===
async function handleBackupCommand(message, args) {
    try {
        if (!isOwner(message.author.id)) {
            return message.reply('❌ Apenas o owner pode usar comandos de backup!');
        }

        const subCommand = args[1];
        
        if (!subCommand) {
            const embed = new EmbedBuilder()
                .setTitle('💾 Sistema de Backup')
                .setDescription('Comandos disponíveis para gerenciar backups do banco de dados')
                .addFields(
                    { name: '📋 Comandos', value: '`!backup create` - Criar backup manual\n`!backup status` - Ver status do backup automático\n`!backup start <horas>` - Iniciar backup automático\n`!backup stop` - Parar backup automático', inline: false }
                )
                .setColor('#3498db')
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }

        switch (subCommand) {
            case 'create':
                const statusMsg = await message.reply('⏳ Criando backup...');
                const result = await db.createBackup();
                
                if (result.success) {
                    await statusMsg.edit(`✅ Backup criado com sucesso!\n📁 Arquivo: \`${result.filename}\``);
                } else {
                    await statusMsg.edit(`❌ Erro ao criar backup: ${result.error}`);
                }
                break;

            case 'status':
                const status = await db.getBackupStatus();
                const embed = new EmbedBuilder()
                    .setTitle('📊 Status do Backup Automático')
                    .addFields(
                        { name: '🔄 Status', value: status.isRunning ? '✅ Ativo' : '❌ Inativo', inline: true },
                        { name: '⏰ Intervalo', value: status.isRunning ? `${status.intervalHours}h` : 'N/A', inline: true },
                        { name: '📅 Próximo Backup', value: status.nextBackup || 'N/A', inline: false }
                    )
                    .setColor(status.isRunning ? '#2ecc71' : '#e74c3c')
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;

            case 'start':
                const hours = parseInt(args[2]);
                if (!hours || hours < 1 || hours > 168) {
                    return message.reply('❌ Especifique um intervalo válido entre 1 e 168 horas!');
                }
                
                await db.startAutoBackup(hours);
                await message.reply(`✅ Backup automático iniciado com intervalo de ${hours} horas!`);
                break;

            case 'stop':
                await db.stopAutoBackup();
                await message.reply('✅ Backup automático parado!');
                break;

            default:
                await message.reply('❌ Subcomando inválido! Use `!backup` para ver os comandos disponíveis.');
        }
    } catch (error) {
        console.error('Erro no comando backup:', error);
        await message.reply('❌ Erro ao executar comando de backup!');
    }
}

async function handleRestoreCommand(message, args) {
    try {
        if (!isOwner(message.author.id)) {
            return message.reply('❌ Apenas o owner pode restaurar backups!');
        }

        const filename = args[1];
        if (!filename) {
            return message.reply('❌ Especifique o nome do arquivo de backup! Use `!backups` para ver os disponíveis.');
        }

        const confirmMsg = await message.reply('⚠️ **ATENÇÃO**: Restaurar um backup irá **SOBRESCREVER** todos os dados atuais do banco!\n\nReaja com ✅ para confirmar ou ❌ para cancelar.');
        
        await confirmMsg.react('✅');
        await confirmMsg.react('❌');

        const filter = (reaction, user) => {
            return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };

        const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
        const reaction = collected.first();

        if (reaction.emoji.name === '✅') {
            const statusMsg = await message.reply('⏳ Restaurando backup...');
            const result = await db.restoreBackup(filename);
            
            if (result.success) {
                await statusMsg.edit('✅ Backup restaurado com sucesso!');
            } else {
                await statusMsg.edit(`❌ Erro ao restaurar backup: ${result.error}`);
            }
        } else {
            await message.reply('❌ Restauração cancelada.');
        }

    } catch (error) {
        if (error.message === 'time') {
            await message.reply('❌ Tempo esgotado. Restauração cancelada.');
        } else {
            console.error('Erro no comando restore:', error);
            await message.reply('❌ Erro ao executar comando de restauração!');
        }
    }
}

async function handleBackupsListCommand(message) {
    try {
        if (!isOwner(message.author.id)) {
            return message.reply('❌ Apenas o owner pode listar backups!');
        }

        const backups = await db.listBackups();
        
        if (backups.length === 0) {
            return message.reply('📁 Nenhum backup encontrado.');
        }

        const embed = new EmbedBuilder()
            .setTitle('📁 Backups Disponíveis')
            .setDescription('Lista de todos os backups do banco de dados')
            .setColor('#3498db')
            .setTimestamp();

        const backupList = backups.slice(0, 10).map((backup, index) => {
            return `${index + 1}. \`${backup.filename}\` - ${backup.size} (${backup.date})`;
        }).join('\n');

        embed.addFields({ name: '📋 Arquivos', value: backupList, inline: false });

        if (backups.length > 10) {
            embed.setFooter({ text: `Mostrando 10 de ${backups.length} backups` });
        }

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Erro no comando backups:', error);
        await message.reply('❌ Erro ao listar backups!');
    }
}

async function forwardImageToChannel(message, channelId) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setAuthor({
                name: message.author.username,
                iconURL: message.author.displayAvatarURL()
            })
            .setTimestamp();
        
        if (message.content) {
            embed.setDescription(message.content);
        }
        
        const files = message.attachments.map(attachment => attachment.url);
        
        await channel.send({ embeds: [embed], files: files });
        
    } catch (error) {
        console.error('Erro ao encaminhar imagem:', error);
    }
}

// Login do bot
client.login(process.env.DISCORD_TOKEN);