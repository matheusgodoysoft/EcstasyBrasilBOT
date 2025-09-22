const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
require('dotenv').config();

// Sistema de permissões - usuários autorizados
const authorizedUsers = new Set();

// Adiciona o dono como usuário autorizado por padrão
if (process.env.OWNER_ID) {
    authorizedUsers.add(process.env.OWNER_ID);
}

// Adiciona usuários autorizados do .env (separados por vírgula)
if (process.env.AUTHORIZED_USERS) {
    const users = process.env.AUTHORIZED_USERS.split(',').map(id => id.trim());
    users.forEach(userId => {
        if (userId) authorizedUsers.add(userId);
    });
}

// Função para verificar se usuário tem permissão
function hasPermission(userId) {
    return authorizedUsers.has(userId);
}

// Função para verificar se é o dono
function isOwner(userId) {
    return userId === process.env.OWNER_ID;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.once('clientReady', () => {
    console.log(`🤖 Bot conectado como ${client.user.tag}!`);
    console.log(`📋 Comandos disponíveis:`);
    console.log(`   !send <#canal> <mensagem> - Enviar mensagem`);
    console.log(`   !list - Listar servidores e canais`);
    console.log(`   !help - Mostrar ajuda`);
    
    // Inicia servidor de webhook
    webhookServer = new WebhookServer(client, payments);
    webhookServer.start();
});

// Event listener para interações com botões
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const [action, plan, userId] = interaction.customId.split('_');
    
    // Verifica se a interação é do usuário correto
    if (interaction.user.id !== userId) {
        return interaction.reply({ 
            content: '❌ Esta seleção não é para você!', 
            ephemeral: true 
        });
    }
    
    const selection = pendingSelections.get(userId);
    if (!selection) {
        return interaction.reply({ 
            content: '❌ Seleção expirada ou não encontrada!', 
            ephemeral: true 
        });
    }
    
    try {
        if (action === 'plan') {
            await handlePlanSelection(interaction, plan, userId, selection);
        } else if (action === 'payment') {
            await handlePaymentMethodSelection(interaction, plan, userId, selection);
        }
    } catch (error) {
        console.error('Erro ao processar interação:', error);
        await interaction.reply({ 
            content: '❌ Erro ao processar sua seleção. Tente novamente.', 
            ephemeral: true 
        });
    }
});

client.on('messageCreate', async (message) => {
    // Ignora mensagens do próprio bot
    if (message.author.bot) return;
    
    // Só processa mensagens via DM
    if (message.channel.type !== ChannelType.DM) return;
    
    // Verifica se é um comando (começa com !)
    const isCommand = message.content.startsWith('!');
    
    // Se for comando, verifica permissões
    if (isCommand) {
        if (!hasPermission(message.author.id)) {
            return; // Usuário não autorizado, ignora comando
        }
    } else {
        // Se NÃO for comando, verifica se é comprovante (qualquer usuário pode enviar)
        if (isPaymentProof(message)) {
            await forwardPaymentProof(message);
            return;
        }
        
        // Se NÃO for comando e NÃO for do dono, encaminha para o dono
        if (message.author.id !== process.env.OWNER_ID) {
            try {
                const owner = await client.users.fetch(process.env.OWNER_ID);
                
                const forwardEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: `📨 Resposta de ${message.author.displayName || message.author.username}`,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setDescription(message.content || '*Mensagem sem texto*')
                    .setColor('#ff6b6b')
                    .setTimestamp()
                    .setFooter({
                        text: `ID: ${message.author.id}`,
                        iconURL: client.user.displayAvatarURL()
                    });
                
                await owner.send({ embeds: [forwardEmbed] });
                
                // Se houver anexos, encaminha também
                if (message.attachments.size > 0) {
                    message.attachments.forEach(async (attachment) => {
                        await owner.send({
                            content: `📎 **Anexo de ${message.author.displayName}:**`,
                            files: [attachment.url]
                        });
                    });
                }
                
            } catch (error) {
                console.error('Erro ao encaminhar mensagem:', error);
            }
            return;
        }
    }
    
    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    
    try {
        switch (command) {
            case '!send':
                await handleSendCommand(message, args);
                break;
            case '!dm':
                await handleDMCommand(message, args);
                break;
            case '!list':
                await handleListCommand(message);
                break;
            case '!payment':
                await handlePaymentCommand(message, args);
                break;
            case '!pagamento':
                await handlePagamentoCommand(message, args);
                break;
            case '!checkpayment':
                await handleCheckPaymentCommand(message, args);
                break;
            case '!confirmpayment':
                await handleConfirmPaymentCommand(message, args);
                break;
            case '!payments':
                await handlePaymentsListCommand(message);
                break;
            case '!webhook':
                await handleWebhookCommand(message, args);
                break;
            case '!limpar':
                await handleClearCommand(message);
                break;
            case '!help':
                await handleHelpCommand(message);
                break;
            case '!vendas':
                await handleVendasCommand(message);
                break;
            case '!clientes':
                await handleClientesCommand(message);
                break;
            case '!status':
                await handleStatusCommand(message);
                break;
            case '!addcliente':
                await handleAddClienteCommand(message, args);
                break;
            case '!adduser':
                await handleAddUserCommand(message, args);
                break;
            case '!removeuser':
                await handleRemoveUserCommand(message, args);
                break;
            case '!listusers':
                await handleListUsersCommand(message);
                break;
            default:
                if (message.content.startsWith('!')) {
                    await message.reply('❌ Comando não reconhecido. Use `!help` para ver os comandos disponíveis.');
                }
        }
    } catch (error) {
        console.error('Erro ao processar comando:', error);
        await message.reply('❌ Ocorreu um erro ao processar seu comando.');
    }
});

async function handleSendCommand(message, args) {
    if (args.length < 3) {
        return message.reply('❌ Uso correto: `!send <#canal> <mensagem>`\nExemplo: `!send #geral Olá pessoal!`');
    }
    
    const channelMention = args[1];
    const messageContent = args.slice(2).join(' ');
    
    // Extrai o ID do canal da menção
    const channelId = channelMention.replace(/[<#>]/g, '');
    
    const targetChannel = client.channels.cache.get(channelId);
    
    if (!targetChannel) {
        return message.reply('❌ Canal não encontrado! Verifique se o bot tem acesso ao canal.');
    }
    
    // Envia mensagem direta como se fosse o próprio bot
    await targetChannel.send(messageContent);
    
    await message.reply(`✅ Mensagem enviada para ${targetChannel.name} em ${targetChannel.guild.name}!`);
}

async function handleListCommand(message) {
    const guilds = client.guilds.cache;
    
    if (guilds.size === 0) {
        return message.reply('❌ O bot não está em nenhum servidor.');
    }
    
    let response = '📋 **Servidores e Canais Disponíveis:**\n\n';
    
    guilds.forEach(guild => {
        response += `🏠 **${guild.name}**\n`;
        
        const textChannels = guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildText)
            .first(10); // Limita a 10 canais por servidor
        
        textChannels.forEach(channel => {
            response += `   📝 <#${channel.id}> (${channel.name})\n`;
        });
        
        response += '\n';
    });
    
    response += '💡 **Como usar:** `!send <#canal> <sua mensagem>`';
    
    // Divide a mensagem se for muito longa
    if (response.length > 2000) {
        const chunks = response.match(/[\s\S]{1,1900}/g);
        for (const chunk of chunks) {
            await message.reply(chunk);
        }
    } else {
        await message.reply(response);
    }
}

async function handleDMCommand(message, args) {
    if (args.length < 3) {
        return message.reply('❌ Uso correto: `!dm <@usuário> <mensagem>`\nExemplo: `!dm @João Olá, como você está?`');
    }
    
    const userMention = args[1];
    const messageContent = args.slice(2).join(' ');
    
    // Extrai o ID do usuário da menção
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        // Tenta enviar DM
        await targetUser.send(messageContent);
        
        await message.reply(`✅ DM enviada para ${targetUser.username}!`);
        
    } catch (error) {
        console.error('Erro ao enviar DM:', error);
        
        if (error.code === 50007) {
            await message.reply('❌ Não foi possível enviar DM. O usuário pode ter bloqueado DMs de bots ou não compartilha servidores com o bot.');
        } else {
            await message.reply('❌ Erro ao enviar DM. Verifique se o ID do usuário está correto.');
        }
    }
}

async function handleHelpCommand(message) {
    const isOwnerUser = isOwner(message.author.id);
    
    const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Proxy - Comandos')
        .setDescription('Bot completo para vendas e comunicação!')
        .addFields(
            {
                name: '📤 COMUNICAÇÃO',
                value: '`!send <#canal> <mensagem>` - Enviar para canal\n`!dm <@usuário> <mensagem>` - Enviar DM\n`!list` - Listar canais disponíveis\n`!limpar [@usuário]` - Apagar todas as mensagens do chat (ou de outro usuário se mencionado)',
                inline: false
            },
            {
                name: '💳 SISTEMA DE PAGAMENTOS',
                value: '`!pagamento <@usuário>` - Seleção interativa de planos\n`!payment <@usuário> <valor> <método>` - Criar cobrança manual\n`!addcliente <@usuário> <dias> <standard|infinity>` - Adicionar cliente manualmente\n`!checkpayment <@usuário>` - Verificar pagamentos\n`!confirmpayment <ID>` - Confirmar pagamento\n`!payments` - Listar pendentes\n`!webhook` - Configurar webhook de pagamentos',
                inline: false
            },
            {
                name: '📊 RELATÓRIOS',
                value: '`!vendas` - Relatório de vendas (dia/mês/total)\n`!clientes` - Lista de clientes e histórico\n`!status` - Status geral do sistema',
                inline: false
            },
            {
                name: '💡 EXEMPLOS',
                value: '`!payment @João 99.90 PIX`\n`!send #vendas Nova promoção!`\n`!dm @cliente Obrigado pela compra!`',
                inline: false
            }
        )
        .setColor('#5865F2')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({
            text: 'Bot Proxy - Sistema de Vendas',
            iconURL: client.user.displayAvatarURL()
        });
    
    // Adiciona seção de gerenciamento de usuários apenas para o dono
    if (isOwnerUser) {
        embed.addFields({
            name: '👑 GERENCIAMENTO DE USUÁRIOS (Apenas Dono)',
            value: '`!adduser <@usuário>` - Autorizar usuário a usar o bot\n`!removeuser <@usuário>` - Remover autorização do usuário\n`!listusers` - Listar todos os usuários autorizados',
            inline: false
        });
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleClearCommand(message) {
    try {
        // Confirma se é realmente o dono
        if (message.author.id !== process.env.OWNER_ID) {
            return await message.reply('❌ Apenas o dono do bot pode usar este comando!');
        }

        // Verifica se é um DM
        if (message.channel.type !== ChannelType.DM) {
            return await message.reply('❌ Este comando só funciona em mensagens diretas!');
        }

        // Extrai argumentos do comando
        const args = message.content.split(' ');
        let targetUser = null;
        let targetChannel = null;
        
        // Verifica se há menção de usuário
        if (args.length > 1) {
            const userId = args[1].replace(/[<@!>]/g, '');
            try {
                targetUser = await client.users.fetch(userId);
                // Abre DM com o usuário mencionado
                targetChannel = await targetUser.createDM();
            } catch (error) {
                return await message.reply('❌ Usuário não encontrado ou não foi possível abrir conversa com ele!');
            }
        } else {
            // Se não há menção, limpa a conversa atual
            targetChannel = message.channel;
        }

        const targetDescription = targetUser 
            ? `**TODAS** as mensagens da conversa com ${targetUser.displayName || targetUser.username}`
            : '**TODAS** as mensagens desta conversa';

        const confirmEmbed = new EmbedBuilder()
            .setTitle('🗑️ Confirmar Limpeza')
            .setDescription(`Tem certeza que deseja apagar ${targetDescription}?\n\n⚠️ **Esta ação não pode ser desfeita!**`)
            .setColor('#ff6b6b')
            .setFooter({ text: 'Responda com "sim" para confirmar ou "não" para cancelar' });

        await message.reply({ embeds: [confirmEmbed] });

        // Aguarda confirmação
        const filter = (m) => m.author.id === message.author.id && ['sim', 'não', 'nao', 'yes', 'no'].includes(m.content.toLowerCase());
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        
        const response = collected.first().content.toLowerCase();
        
        if (['sim', 'yes'].includes(response)) {
            const loadingMsg = await message.channel.send('🔄 Limpando mensagens...');
            
            let deletedCount = 0;
            let lastMessageId;
            
            // Busca e deleta mensagens em lotes do canal alvo
            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }
                
                const messages = await targetChannel.messages.fetch(options);
                
                if (messages.size === 0) break;
                
                for (const msg of messages.values()) {
                    try {
                        await msg.delete();
                        deletedCount++;
                        // Pequena pausa para evitar rate limit
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.log(`Não foi possível deletar mensagem: ${error.message}`);
                    }
                }
                
                lastMessageId = messages.last()?.id;
            }
            
            // Envia mensagem de confirmação
            const successDescription = targetUser 
                ? `🗑️ **${deletedCount}** mensagens da conversa com ${targetUser.displayName || targetUser.username} foram apagadas!`
                : `🗑️ **${deletedCount}** mensagens foram apagadas com sucesso!`;
                
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Limpeza Concluída')
                .setDescription(successDescription)
                .setColor('#00ff00')
                .setTimestamp();
                
            await message.channel.send({ embeds: [successEmbed] });
            
        } else {
            const cancelEmbed = new EmbedBuilder()
                .setTitle('❌ Limpeza Cancelada')
                .setDescription('A limpeza das mensagens foi cancelada.')
                .setColor('#ffa500');
                
            await message.channel.send({ embeds: [cancelEmbed] });
        }
        
    } catch (error) {
        if (error.message.includes('time')) {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Tempo Esgotado')
                .setDescription('A confirmação expirou. Limpeza cancelada.')
                .setColor('#ffa500');
                
            await message.channel.send({ embeds: [timeoutEmbed] });
        } else {
            console.error('Erro ao limpar mensagens:', error);
            await message.reply('❌ Ocorreu um erro ao tentar limpar as mensagens.');
        }
    }
}

// Sistema de pagamentos - armazenamento em memória (para produção, use banco de dados)
const payments = new Map();
const pendingSelections = new Map(); // Para armazenar seleções em andamento

// Importa e inicia servidor de webhook
const WebhookServer = require('./webhook-server');
let webhookServer;

async function handlePlanSelection(interaction, plan, userId, selection) {
    const planInfo = {
        standard: { name: 'Ecstasy Standard', price: 100.00, emoji: '🌟' },
        infinity: { name: 'Infinity Premium', price: 500.00, emoji: '🚀' }
    };
    
    const selectedPlan = planInfo[plan];
    if (!selectedPlan) {
        return interaction.reply({ 
            content: '❌ Plano inválido!', 
            ephemeral: true 
        });
    }
    
    // Atualiza a seleção pendente
    selection.selectedPlan = plan;
    selection.planInfo = selectedPlan;
    selection.step = 'payment_method';
    pendingSelections.set(userId, selection);
    
    // Cria embed para seleção de método de pagamento
    const paymentEmbed = new EmbedBuilder()
        .setTitle('💳 Método de Pagamento')
        .setDescription(`Plano selecionado: **${selectedPlan.emoji} ${selectedPlan.name}**\nValor: **R$ ${selectedPlan.price.toFixed(2)}**\n\nEscolha como deseja pagar:`)
        .addFields(
            {
                name: '📱 PIX',
                value: '• Pagamento instantâneo\n• Aprovação automática\n• Disponível 24h',
                inline: true
            },
            {
                name: '💳 Cartão de Crédito',
                value: '• Parcelamento disponível\n• Processamento seguro\n• Aprovação rápida',
                inline: true
            }
        )
        .setColor('#00ff88')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Pagamentos Ecstasy',
            iconURL: interaction.client.user.displayAvatarURL()
        });
    
    // Cria botões para seleção de método de pagamento
    const paymentButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`payment_pix_${userId}`)
                .setLabel('📱 PIX')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`payment_cartao_${userId}`)
                .setLabel('💳 Cartão de Crédito')
                .setStyle(ButtonStyle.Primary)
        );
    
    // Atualiza a mensagem com a nova interface
    await interaction.update({ 
        embeds: [paymentEmbed], 
        components: [paymentButtons] 
    });
}

async function handlePaymentMethodSelection(interaction, method, userId, selection) {
    if (!selection.selectedPlan || !selection.planInfo) {
        return interaction.reply({ 
            content: '❌ Erro: Plano não selecionado!', 
            ephemeral: true 
        });
    }
    
    const { selectedPlan, planInfo } = selection;
    const methodName = method === 'pix' ? 'PIX' : 'Cartão de Crédito';
    
    // Gera ID único para o pagamento
    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Armazena o pagamento pendente com informações do plano
    payments.set(paymentId, {
        userId: userId,
        username: interaction.user.username,
        valor: planInfo.price,
        metodo: methodName,
        status: 'PENDENTE',
        plano: planInfo.name,
        planEmoji: planInfo.emoji,
        createdAt: new Date(),
        paymentId: paymentId
    });
    
    // Remove a seleção pendente
    pendingSelections.delete(userId);
    
    // Links diretos da Kirvano baseados no plano selecionado
    let kirvanoPixLink, kirvanoCardLink;
    
    if (selectedPlan === 'standard') {
        kirvanoPixLink = process.env.KIRVANO_STANDARD_PIX_LINK || 'https://pay.kirvano.com/21e3a7f0-b57c-42a6-8132-ae7cb28b7d7f';
        kirvanoCardLink = process.env.KIRVANO_STANDARD_CARD_LINK || 'https://pay.kirvano.com/21e3a7f0-b57c-42a6-8132-ae7cb28b7d7f';
    } else if (selectedPlan === 'infinity') {
        kirvanoPixLink = process.env.KIRVANO_INFINITY_PIX_LINK || 'https://pay.kirvano.com/cb04d3fa-07d2-4ddd-8ebd-94e39946e613';
        kirvanoCardLink = process.env.KIRVANO_INFINITY_CARD_LINK || 'https://pay.kirvano.com/cb04d3fa-07d2-4ddd-8ebd-94e39946e613';
    } else {
        // Fallback para planos não reconhecidos
        kirvanoPixLink = process.env.KIRVANO_STANDARD_PIX_LINK || 'https://pay.kirvano.com/21e3a7f0-b57c-42a6-8132-ae7cb28b7d7f';
        kirvanoCardLink = process.env.KIRVANO_STANDARD_CARD_LINK || 'https://pay.kirvano.com/21e3a7f0-b57c-42a6-8132-ae7cb28b7d7f';
    }
    
    const paymentUrl = method === 'pix' ? kirvanoPixLink : kirvanoCardLink;
    
    // Cria embed com link direto
    const paymentEmbed = new EmbedBuilder()
        .setTitle('💳 Link de Pagamento Gerado')
        .setDescription(`Clique no link abaixo para realizar seu pagamento:`)
        .addFields(
            { name: '💎 Plano', value: `${planInfo.emoji} ${planInfo.name}`, inline: true },
            { name: '💰 Valor', value: `R$ ${planInfo.price.toFixed(2)}`, inline: true },
            { name: '💳 Método', value: methodName, inline: true },
            { name: '🔗 Link de Pagamento', value: `[**CLIQUE AQUI PARA PAGAR**](${paymentUrl})`, inline: false },
            { name: '⚠️ Importante', value: 'O link é válido por 24 horas. Após o pagamento, seu acesso será liberado automaticamente.', inline: false },
            { name: '⏰ Tempo de Entrega', value: planInfo.name === 'Ecstasy Standard' ? '🌟 **Standard**: Até 12 horas após confirmação do pagamento' : '🚀 **Infinity Premium**: Até 24 horas após confirmação do pagamento', inline: false }
        )
        .setColor('#00ff88')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Pagamentos Ecstasy',
            iconURL: interaction.client.user.displayAvatarURL()
        });
    
    // Atualiza a mensagem com o link de pagamento
    await interaction.update({ 
        embeds: [paymentEmbed], 
        components: [] // Remove os botões
    });
    
    // Envia mensagem adicional solicitando comprovante após pagamento
    setTimeout(async () => {
        try {
            const proofEmbed = new EmbedBuilder()
                .setTitle('📄 Comprovante de Pagamento')
                .setDescription('Após realizar o pagamento, **envie o comprovante** nesta conversa para agilizar a liberação do seu acesso!')
                .addFields(
                    { name: '📋 Como enviar', value: '• Tire uma foto ou screenshot do comprovante\n• Envie a imagem aqui no chat\n• Aguarde a confirmação', inline: false },
                    { name: '⏰ Tempo de liberação', value: 'Após enviar o comprovante, seu acesso será liberado em até 12/24 horas.', inline: false },
                    { name: '📦 Tempo de Entrega do Produto', value: 'Standard: até 12 horas | Infinity Premium: até 24 horas', inline: false }
                )
                .setColor('#ffa500')
                .setTimestamp()
                .setFooter({
                    text: 'Sistema de Pagamentos Ecstasy',
                    iconURL: interaction.client.user.displayAvatarURL()
                });
            
            await interaction.followUp({ embeds: [proofEmbed], ephemeral: false });
        } catch (error) {
            console.error('Erro ao enviar mensagem de comprovante:', error);
        }
    }, 2000); // Aguarda 2 segundos após o link ser enviado
    
    // Notifica o administrador
    try {
        const owner = await interaction.client.users.fetch(selection.createdBy);
        const adminEmbed = new EmbedBuilder()
            .setTitle('🔗 Link de Pagamento Gerado')
            .setDescription(`**${interaction.user.username}** gerou um link de pagamento!`)
            .addFields(
                { name: '👤 Cliente', value: interaction.user.username, inline: true },
                { name: '💎 Plano', value: `${planInfo.emoji} ${planInfo.name}`, inline: true },
                { name: '💰 Valor', value: `R$ ${planInfo.price.toFixed(2)}`, inline: true },
                { name: '💳 Método', value: methodName, inline: true },
                { name: '🆔 ID', value: paymentId, inline: false },
                { name: '🔗 Link', value: paymentUrl, inline: false }
            )
            .setColor('#ffa500')
            .setTimestamp();
        
        await owner.send({ embeds: [adminEmbed] });
    } catch (error) {
        console.error('Erro ao notificar administrador:', error);
    }
}

async function handlePagamentoCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!pagamento <@usuário>`\nExemplo: `!pagamento @João`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        // Cria embed para seleção de planos
        const planEmbed = new EmbedBuilder()
            .setTitle('💎 Selecione seu Plano')
            .setDescription(`Olá **${targetUser.username}**! Escolha o plano que deseja adquirir:`)
            .addFields(
                {
                    name: '🌟 Ecstasy Standard',
                    value: '**R$ 100,00**\n✅ Acesso à interface do usuário no jogo\n✅ Acesso à interface do usuário via web\n✅ Uma alteração de HWID (apenas para configuração inicial)\n✅ Publique configurações ilimitadas\n✅ Suporte ilimitado',
                    inline: true
                },
                {
                    name: '🚀 Infinity Premium',
                    value: '**R$ 500,00**\n✅ Totalmente exclusivo\n✅ Não é necessário baixar .exe\n✅ Carrega na inicialização\n✅ Projetado para não deixar rastros\n✅ Estabelece o padrão ouro para execução sem rastros\n✅ Inclui todos os recursos da assinatura Standard',
                    inline: true
                }
            )
            .setColor('#5865F2')
            .setTimestamp()
            .setFooter({
                text: 'Sistema de Pagamentos Ecstasy',
                iconURL: client.user.displayAvatarURL()
            });
        
        // Cria botões para seleção de planos
        const planButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`plan_standard_${targetUser.id}`)
                    .setLabel('🌟 Standard - R$ 100')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`plan_infinity_${targetUser.id}`)
                    .setLabel('🚀 Infinity - R$ 500')
                    .setStyle(ButtonStyle.Success)
            );
        
        // Envia mensagem com botões para o cliente
        const planMessage = await targetUser.send({ 
            embeds: [planEmbed], 
            components: [planButtons] 
        });
        
        // Armazena a seleção pendente
        pendingSelections.set(targetUser.id, {
            messageId: planMessage.id,
            step: 'plan_selection',
            createdBy: message.author.id,
            createdAt: new Date()
        });
        
        // Confirma para o administrador
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Seleção de Plano Enviada')
            .setDescription(`Interface de seleção enviada para **${targetUser.username}**`)
            .addFields(
                { name: '👤 Cliente', value: targetUser.username, inline: true },
                { name: '📱 Status', value: '🟡 Aguardando seleção', inline: true }
            )
            .setColor('#ffa500')
            .setTimestamp();
        
        await message.reply({ embeds: [confirmEmbed] });
        
    } catch (error) {
        console.error('Erro ao criar seleção de pagamento:', error);
        await message.reply('❌ Erro ao criar seleção de pagamento. Verifique se o usuário existe.');
    }
}

async function handlePaymentCommand(message, args) {
    if (args.length < 4) {
        return message.reply('❌ Uso correto: `!payment <@usuário> <valor> <método>`\nExemplo: `!payment @João 99.90 PIX`\nMétodos: PIX, CARTAO, BOLETO');
    }
    
    const userMention = args[1];
    const valor = parseFloat(args[2]);
    const metodo = args[3].toUpperCase();
    
    if (isNaN(valor) || valor <= 0) {
        return message.reply('❌ Valor inválido! Use números como 99.90');
    }
    
    if (!['PIX', 'CARTAO', 'BOLETO'].includes(metodo)) {
        return message.reply('❌ Método inválido! Use: PIX, CARTAO ou BOLETO');
    }
    
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        // Gera ID único para o pagamento
        const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        // Armazena o pagamento
        payments.set(paymentId, {
            userId: targetUser.id,
            username: targetUser.username,
            valor: valor,
            metodo: metodo,
            status: 'PENDENTE',
            createdAt: new Date(),
            createdBy: message.author.id
        });
        
        // Cria embed para o cliente
        const paymentEmbed = new EmbedBuilder()
            .setTitle('💳 Cobrança Gerada')
            .setDescription(`Olá! Foi gerada uma cobrança para você.`)
            .addFields(
                { name: '💰 Valor', value: `R$ ${valor.toFixed(2)}`, inline: true },
                { name: '💳 Método', value: metodo, inline: true },
                { name: '🆔 ID do Pagamento', value: paymentId, inline: false }
            )
            .setColor('#00ff88')
            .setTimestamp()
            .setFooter({
                text: 'Sistema de Pagamentos',
                iconURL: client.user.displayAvatarURL()
            });
        
        // Adiciona instruções específicas por método
        if (metodo === 'PIX') {
            paymentEmbed.addFields({
                name: '📱 Instruções PIX',
                value: '1. Copie a chave PIX: **seuemail@exemplo.com**\n2. Faça o pagamento no seu banco\n3. Envie o comprovante aqui no chat\n4. Aguarde a confirmação'
            });
        } else if (metodo === 'CARTAO') {
            paymentEmbed.addFields({
                name: '💳 Link do Cartão',
                value: `[Clique aqui para pagar](https://exemplo.com/payment/${paymentId})\n*Link válido por 24 horas*`
            });
        } else if (metodo === 'BOLETO') {
            paymentEmbed.addFields({
                name: '📄 Boleto',
                value: `[Baixar Boleto](https://exemplo.com/boleto/${paymentId})\n*Vencimento: 3 dias úteis*`
            });
        }
        
        // Envia para o cliente
        await targetUser.send({ embeds: [paymentEmbed] });
        
        // Envia mensagem adicional solicitando comprovante após pagamento (para PIX)
        if (metodo === 'PIX') {
            setTimeout(async () => {
                try {
                    const proofEmbed = new EmbedBuilder()
                        .setTitle('📄 Comprovante de Pagamento')
                        .setDescription('Após realizar o pagamento PIX, **envie o comprovante** nesta conversa para agilizar a confirmação!')
                        .addFields(
                            { name: '📋 Como enviar', value: '• Tire uma foto ou screenshot do comprovante\n• Envie a imagem aqui no chat\n• Aguarde a confirmação manual', inline: false },
                            { name: '⏰ Tempo de confirmação', value: 'Após enviar o comprovante, a confirmação será feita em até 30 minutos.', inline: false },
                             { name: '📦 Tempo de Entrega', value: 'Após confirmação: Standard até 12h | Infinity Premium até 24h', inline: false }
                        )
                        .setColor('#ffa500')
                        .setTimestamp()
                        .setFooter({
                            text: 'Sistema de Pagamentos Ecstasy',
                            iconURL: client.user.displayAvatarURL()
                        });
                    
                    await targetUser.send({ embeds: [proofEmbed] });
                } catch (error) {
                    console.error('Erro ao enviar mensagem de comprovante:', error);
                }
            }, 3000); // Aguarda 3 segundos após o pagamento ser enviado
        }
        
        // Confirma para você
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Cobrança Criada')
            .setDescription(`Cobrança enviada para **${targetUser.username}**`)
            .addFields(
                { name: '💰 Valor', value: `R$ ${valor.toFixed(2)}`, inline: true },
                { name: '💳 Método', value: metodo, inline: true },
                { name: '🆔 ID', value: paymentId, inline: false },
                { name: '📊 Status', value: '🟡 PENDENTE', inline: true }
            )
            .setColor('#ffa500')
            .setTimestamp();
        
        await message.reply({ embeds: [confirmEmbed] });
        
    } catch (error) {
        console.error('Erro ao criar pagamento:', error);
        await message.reply('❌ Erro ao criar cobrança. Verifique se o usuário existe.');
    }
}

async function handleCheckPaymentCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!checkpayment <@usuário>`\nExemplo: `!checkpayment @João`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        // Busca pagamentos do usuário
        const userPayments = Array.from(payments.entries())
            .filter(([id, payment]) => payment.userId === userId)
            .sort((a, b) => b[1].createdAt - a[1].createdAt);
        
        if (userPayments.length === 0) {
            return message.reply(`❌ Nenhum pagamento encontrado para **${targetUser.username}**.`);
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`💳 Pagamentos de ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor('#5865F2')
            .setTimestamp();
        
        userPayments.slice(0, 5).forEach(([paymentId, payment]) => {
            const statusIcon = payment.status === 'PAGO' ? '🟢' : 
                             payment.status === 'CANCELADO' ? '🔴' : '🟡';
            
            embed.addFields({
                name: `${statusIcon} ${paymentId}`,
                value: `**Valor:** R$ ${payment.valor.toFixed(2)}\n**Método:** ${payment.metodo}\n**Status:** ${payment.status}\n**Data:** ${payment.createdAt.toLocaleDateString('pt-BR')}`,
                inline: true
            });
        });
        
        await message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        await message.reply('❌ Erro ao verificar pagamentos.');
    }
}

async function handleConfirmPaymentCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!confirmpayment <ID_do_pagamento>`\nExemplo: `!confirmpayment PAY-1234567890-abc12`');
    }
    
    const paymentId = args[1];
    const payment = payments.get(paymentId);
    
    if (!payment) {
        return message.reply('❌ Pagamento não encontrado! Verifique o ID.');
    }
    
    if (payment.status === 'PAGO') {
        return message.reply('❌ Este pagamento já foi confirmado!');
    }
    
    // Atualiza status
    payment.status = 'PAGO';
    payment.confirmedAt = new Date();
    payment.confirmedBy = message.author.id;
    
    try {
        const targetUser = await client.users.fetch(payment.userId);
        
        // Notifica o cliente
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Pagamento Confirmado!')
            .setDescription('Seu pagamento foi confirmado com sucesso!')
            .addFields(
                { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
                { name: '💳 Método', value: payment.metodo, inline: true },
                { name: '🆔 ID', value: paymentId, inline: false },
                { name: '📦 Tempo de Entrega', value: 'Seu produto será entregue em até 12-24 horas dependendo do plano adquirido.', inline: false }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await targetUser.send({ embeds: [successEmbed] });
        
        // Confirma para você
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Pagamento Confirmado')
            .setDescription(`Pagamento de **${targetUser.username}** confirmado!`)
            .addFields(
                { name: '💰 Valor', value: `R$ ${payment.valor.toFixed(2)}`, inline: true },
                { name: '💳 Método', value: payment.metodo, inline: true },
                { name: '🆔 ID', value: paymentId, inline: false },
                { name: '📊 Status', value: '🟢 PAGO', inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await message.reply({ embeds: [confirmEmbed] });
        
        // Notifica no canal de vendas (opcional)
        // Você pode descomentar e configurar um canal específico
        /*
        const salesChannel = client.channels.cache.get('ID_DO_CANAL_VENDAS');
        if (salesChannel) {
            await salesChannel.send(`🎉 **Nova venda confirmada!**\n💰 R$ ${payment.valor.toFixed(2)} - ${targetUser.username}`);
        }
        */
        
    } catch (error) {
        console.error('Erro ao confirmar pagamento:', error);
        await message.reply('❌ Erro ao confirmar pagamento.');
    }
}

async function handlePaymentsListCommand(message) {
    const pendingPayments = Array.from(payments.entries())
        .filter(([id, payment]) => payment.status === 'PENDENTE')
        .sort((a, b) => b[1].createdAt - a[1].createdAt);
    
    if (pendingPayments.length === 0) {
        return message.reply('✅ Nenhum pagamento pendente no momento!');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('💳 Pagamentos Pendentes')
        .setDescription(`Total: ${pendingPayments.length} pagamento(s) pendente(s)`)
        .setColor('#ffa500')
        .setTimestamp();
    
    pendingPayments.slice(0, 10).forEach(([paymentId, payment]) => {
        const timeAgo = Math.floor((Date.now() - payment.createdAt.getTime()) / (1000 * 60));
        
        embed.addFields({
            name: `🟡 ${paymentId}`,
            value: `**Cliente:** ${payment.username}\n**Valor:** R$ ${payment.valor.toFixed(2)}\n**Método:** ${payment.metodo}\n**Há:** ${timeAgo} min`,
            inline: true
        });
    });
    
    embed.setFooter({
        text: 'Use !confirmpayment <ID> para confirmar',
        iconURL: client.user.displayAvatarURL()
    });
    
    await message.reply({ embeds: [embed] });
}

async function handleWebhookCommand(message, args) {
    const port = process.env.WEBHOOK_PORT || 3000;
    
    const embed = new EmbedBuilder()
        .setTitle('🌐 Servidor de Webhook')
        .setDescription('Informações sobre o servidor de webhook para pagamentos automáticos')
        .addFields(
            {
                name: '📡 Servidor de Webhook',
                value: `Servidor rodando na porta ${port}\nEndpoints configurados para receber notificações de pagamento`,
                inline: false
            },

            {
                name: '🔧 Como Configurar',
                value: '1. Configure a URL do webhook no seu gateway de pagamento\n2. Use o endpoint específico do seu gateway\n3. Os pagamentos serão confirmados automaticamente\n4. Você receberá notificações automáticas',
                inline: false
            },
            {
                name: '🧪 Testar Webhook',
                value: 'Use `!testwebhook <payment_id>` para simular uma confirmação',
                inline: false
            }
        )
        .setColor('#00ff88')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Webhook Automático',
            iconURL: client.user.displayAvatarURL()
        });
    
    await message.reply({ embeds: [embed] });
}

async function handleTestWebhookCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!testwebhook <ID_do_pagamento>`\nExemplo: `!testwebhook PAY-1234567890-abc12`');
    }
    
    const paymentId = args[1];
    const payment = payments.get(paymentId);
    
    if (!payment) {
        return message.reply('❌ Pagamento não encontrado! Verifique o ID.');
    }
    
    if (payment.status === 'PAGO') {
        return message.reply('❌ Este pagamento já foi confirmado!');
    }
    
    // Simula confirmação via webhook
    if (webhookServer) {
        await webhookServer.confirmPayment(paymentId, {
            gateway: 'Teste Manual',
            test_mode: true,
            confirmed_by: message.author.username
        });
        
        await message.reply(`✅ Webhook de teste executado para pagamento **${paymentId}**!\nO pagamento foi confirmado automaticamente.`);
    } else {
        await message.reply('❌ Servidor de webhook não está rodando!');
    }
}

async function handleVendasCommand(message) {
    const hoje = new Date();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    // Filtra pagamentos confirmados
    const pagamentosConfirmados = Array.from(payments.entries())
        .filter(([id, payment]) => payment.status === 'PAGO');
    
    // Vendas do dia
    const vendasHoje = pagamentosConfirmados
        .filter(([id, payment]) => payment.confirmedAt >= inicioHoje);
    
    // Vendas do mês
    const vendasMes = pagamentosConfirmados
        .filter(([id, payment]) => payment.confirmedAt >= inicioMes);
    
    // Calcula totais
    const totalHoje = vendasHoje.reduce((sum, [id, payment]) => sum + payment.valor, 0);
    const totalMes = vendasMes.reduce((sum, [id, payment]) => sum + payment.valor, 0);
    const totalGeral = pagamentosConfirmados.reduce((sum, [id, payment]) => sum + payment.valor, 0);
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Relatório de Vendas')
        .setDescription('Resumo das vendas e faturamento')
        .addFields(
            {
                name: '📅 Vendas Hoje',
                value: `**Quantidade:** ${vendasHoje.length} venda(s)\n**Faturamento:** R$ ${totalHoje.toFixed(2)}`,
                inline: true
            },
            {
                name: '📆 Vendas do Mês',
                value: `**Quantidade:** ${vendasMes.length} venda(s)\n**Faturamento:** R$ ${totalMes.toFixed(2)}`,
                inline: true
            },
            {
                name: '💰 Total Geral',
                value: `**Quantidade:** ${pagamentosConfirmados.length} venda(s)\n**Faturamento:** R$ ${totalGeral.toFixed(2)}`,
                inline: true
            }
        )
        .setColor('#00ff88')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Relatórios',
            iconURL: client.user.displayAvatarURL()
        });
    
    // Adiciona últimas vendas se houver
    if (vendasHoje.length > 0) {
        const ultimasVendas = vendasHoje.slice(-3).map(([id, payment]) => 
            `• ${payment.username} - R$ ${payment.valor.toFixed(2)} (${payment.metodo})`
        ).join('\n');
        
        embed.addFields({
            name: '🔥 Últimas Vendas Hoje',
            value: ultimasVendas || 'Nenhuma venda hoje',
            inline: false
        });
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleClientesCommand(message) {
    // Busca todos os clientes únicos
    const clientesUnicos = new Map();
    
    Array.from(payments.entries()).forEach(([id, payment]) => {
        if (!clientesUnicos.has(payment.userId)) {
            clientesUnicos.set(payment.userId, {
                username: payment.username,
                userId: payment.userId,
                totalCompras: 0,
                valorTotal: 0,
                ultimaCompra: null,
                status: 'Inativo'
            });
        }
        
        const cliente = clientesUnicos.get(payment.userId);
        
        if (payment.status === 'PAGO') {
            cliente.totalCompras++;
            cliente.valorTotal += payment.valor;
            
            if (!cliente.ultimaCompra || payment.confirmedAt > cliente.ultimaCompra) {
                cliente.ultimaCompra = payment.confirmedAt;
            }
        }
    });
    
    // Determina status dos clientes (ativo se comprou nos últimos 30 dias)
    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    clientesUnicos.forEach((cliente) => {
        if (cliente.ultimaCompra && cliente.ultimaCompra > trintaDiasAtras) {
            cliente.status = 'Ativo';
        }
    });
    
    const clientesArray = Array.from(clientesUnicos.values())
        .sort((a, b) => (b.ultimaCompra || 0) - (a.ultimaCompra || 0));
    
    const clientesAtivos = clientesArray.filter(c => c.status === 'Ativo').length;
    const totalClientes = clientesArray.length;
    
    const embed = new EmbedBuilder()
        .setTitle('👥 Relatório de Clientes')
        .setDescription('Informações sobre a base de clientes')
        .addFields(
            {
                name: '📊 Resumo Geral',
                value: `**Total de Clientes:** ${totalClientes}\n**Clientes Ativos:** ${clientesAtivos}\n**Clientes Inativos:** ${totalClientes - clientesAtivos}`,
                inline: false
            }
        )
        .setColor('#5865F2')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Relatórios',
            iconURL: client.user.displayAvatarURL()
        });
    
    // Adiciona top 5 clientes
    if (clientesArray.length > 0) {
        const topClientes = clientesArray
            .filter(c => c.totalCompras > 0)
            .sort((a, b) => b.valorTotal - a.valorTotal)
            .slice(0, 5)
            .map((cliente, index) => {
                const statusIcon = cliente.status === 'Ativo' ? '🟢' : '🔴';
                const ultimaCompra = cliente.ultimaCompra ? 
                    new Date(cliente.ultimaCompra).toLocaleDateString('pt-BR') : 'Nunca';
                
                return `${index + 1}. ${statusIcon} **${cliente.username}**\n   💰 R$ ${cliente.valorTotal.toFixed(2)} (${cliente.totalCompras} compras)\n   📅 Última: ${ultimaCompra}`;
            })
            .join('\n\n');
        
        embed.addFields({
            name: '🏆 Top 5 Clientes',
            value: topClientes || 'Nenhum cliente com compras',
            inline: false
        });
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleStatusCommand(message) {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    
    // Estatísticas gerais
    const totalPagamentos = payments.size;
    const pagamentosPendentes = Array.from(payments.values())
        .filter(p => p.status === 'PENDENTE').length;
    const pagamentosConfirmados = Array.from(payments.values())
        .filter(p => p.status === 'PAGO').length;
    
    // Vendas de hoje
    const vendasHoje = Array.from(payments.values())
        .filter(p => p.status === 'PAGO' && p.confirmedAt >= inicioHoje).length;
    
    // Valor total arrecadado
    const valorTotal = Array.from(payments.values())
        .filter(p => p.status === 'PAGO')
        .reduce((sum, p) => sum + p.valor, 0);
    
    // Clientes únicos
    const clientesUnicos = new Set(
        Array.from(payments.values())
            .filter(p => p.status === 'PAGO')
            .map(p => p.userId)
    ).size;
    
    // Status do sistema
    const uptime = process.uptime();
    const uptimeHoras = Math.floor(uptime / 3600);
    const uptimeMinutos = Math.floor((uptime % 3600) / 60);
    
    const embed = new EmbedBuilder()
        .setTitle('⚡ Status do Sistema')
        .setDescription('Resumo geral do sistema de vendas')
        .addFields(
            {
                name: '💳 Pagamentos',
                value: `**Total:** ${totalPagamentos}\n**Confirmados:** ${pagamentosConfirmados}\n**Pendentes:** ${pagamentosPendentes}`,
                inline: true
            },
            {
                name: '📊 Vendas Hoje',
                value: `**Quantidade:** ${vendasHoje}\n**Clientes Únicos:** ${clientesUnicos}`,
                inline: true
            },
            {
                name: '💰 Faturamento',
                value: `**Total Arrecadado:** R$ ${valorTotal.toFixed(2)}`,
                inline: true
            },
            {
                name: '🤖 Sistema',
                value: `**Uptime:** ${uptimeHoras}h ${uptimeMinutos}m\n**Servidores:** ${client.guilds.cache.size}\n**Webhook:** ${webhookServer ? '🟢 Online' : '🔴 Offline'}`,
                inline: false
            }
        )
        .setColor('#ff6b6b')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Relatórios',
            iconURL: client.user.displayAvatarURL()
        });
    
    // Adiciona alertas se necessário
    const alertas = [];
    
    if (pagamentosPendentes > 5) {
        alertas.push('⚠️ Muitos pagamentos pendentes');
    }
    
    if (!webhookServer) {
        alertas.push('🔴 Servidor de webhook offline');
    }
    
    if (alertas.length > 0) {
        embed.addFields({
            name: '🚨 Alertas',
            value: alertas.join('\n'),
            inline: false
        });
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleAddClienteCommand(message, args) {
    if (args.length < 4) {
        return message.reply('❌ Uso correto: `!addcliente <@usuário> <dias> <standard|infinity>`\nExemplo: `!addcliente @João 30 standard`');
    }
    
    const userMention = args[1];
    const dias = parseInt(args[2]);
    const tipoPlano = args[3].toLowerCase();
    
    if (isNaN(dias) || dias <= 0) {
        return message.reply('❌ Número de dias inválido! Use um número positivo.');
    }
    
    if (!['standard', 'infinity'].includes(tipoPlano)) {
        return message.reply('❌ Tipo de plano inválido! Use: `standard` ou `infinity`');
    }
    
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        // Define valores e nomes dos planos
        const planoInfo = {
            standard: {
                nome: 'Ecstasy Standard',
                emoji: '🌟',
                valorBase: 100.00
            },
            infinity: {
                nome: 'Infinity Premium',
                emoji: '🚀',
                valorBase: 150.00
            }
        };
        
        const plano = planoInfo[tipoPlano];
        const valorTotal = (plano.valorBase / 30) * dias; // Calcula valor proporcional aos dias
        
        // Gera ID único para o pagamento
        const paymentId = `ADD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        // Calcula data de expiração
        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + dias);
        
        // Armazena o pagamento como confirmado
        payments.set(paymentId, {
            userId: targetUser.id,
            username: targetUser.username,
            valor: valorTotal,
            metodo: 'MANUAL',
            status: 'PAGO',
            plano: plano.nome,
            dias: dias,
            dataExpiracao: dataExpiracao,
            createdAt: new Date(),
            confirmedAt: new Date(),
            createdBy: message.author.id,
            confirmedBy: message.author.id,
            tipo: 'ADICAO_MANUAL'
        });
        
        // Notifica o cliente
        try {
            const clientEmbed = new EmbedBuilder()
                .setTitle('🎉 Acesso Adicionado!')
                .setDescription(`Seu acesso foi adicionado com sucesso!`)
                .addFields(
                    { name: '💎 Plano', value: `${plano.emoji} ${plano.nome}`, inline: true },
                    { name: '📅 Duração', value: `${dias} dias`, inline: true },
                    { name: '💰 Valor', value: `R$ ${valorTotal.toFixed(2)}`, inline: true },
                    { name: '📆 Expira em', value: dataExpiracao.toLocaleDateString('pt-BR'), inline: true },
                    { name: '🆔 ID', value: paymentId, inline: false },
                    { name: '📦 Próximos Passos', value: 'Você receberá as instruções de acesso em breve. Qualquer dúvida, entre em contato!', inline: false }
                )
                .setColor('#00ff00')
                .setTimestamp()
                .setFooter({
                    text: 'Acesso Adicionado Manualmente',
                    iconURL: client.user.displayAvatarURL()
                });
            
            await targetUser.send({ embeds: [clientEmbed] });
        } catch (error) {
            console.error('Erro ao notificar cliente:', error);
        }
        
        // Confirma para o administrador
        const adminEmbed = new EmbedBuilder()
            .setTitle('✅ Cliente Adicionado com Sucesso!')
            .setDescription(`**${targetUser.username}** foi adicionado ao sistema!`)
            .addFields(
                { name: '👤 Cliente', value: targetUser.username, inline: true },
                { name: '💎 Plano', value: `${plano.emoji} ${plano.nome}`, inline: true },
                { name: '📅 Duração', value: `${dias} dias`, inline: true },
                { name: '💰 Valor Calculado', value: `R$ ${valorTotal.toFixed(2)}`, inline: true },
                { name: '📆 Expira em', value: dataExpiracao.toLocaleDateString('pt-BR'), inline: true },
                { name: '🆔 ID', value: paymentId, inline: false }
            )
            .setColor('#00ff88')
            .setTimestamp()
            .setFooter({
                text: 'Sistema de Adição Manual',
                iconURL: client.user.displayAvatarURL()
            });
        
        await message.reply({ embeds: [adminEmbed] });
        
    } catch (error) {
        console.error('Erro ao adicionar cliente:', error);
        await message.reply('❌ Erro ao adicionar cliente. Verifique se o usuário existe.');
    }
}

// Funções de gerenciamento de usuários (apenas para o dono)
async function handleAddUserCommand(message, args) {
    // Verifica se é o dono
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono do bot pode adicionar usuários autorizados!');
    }
    
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!adduser <@usuário>`\nExemplo: `!adduser @João`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        if (authorizedUsers.has(userId)) {
            return message.reply(`❌ **${targetUser.username}** já está autorizado a usar o bot!`);
        }
        
        authorizedUsers.add(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Usuário Autorizado!')
            .setDescription(`**${targetUser.username}** agora pode usar o bot!`)
            .addFields(
                { name: '👤 Usuário', value: targetUser.username, inline: true },
                { name: '🆔 ID', value: userId, inline: true },
                { name: '📊 Total de Usuários', value: `${authorizedUsers.size} usuários autorizados`, inline: true }
            )
            .setColor('#00ff88')
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp()
            .setFooter({
                text: 'Sistema de Permissões',
                iconURL: client.user.displayAvatarURL()
            });
        
        await message.reply({ embeds: [embed] });
        
        // Notifica o usuário autorizado
        try {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🎉 Acesso Autorizado!')
                .setDescription('Você foi autorizado a usar o Bot Proxy!')
                .addFields(
                    { name: '📋 Como usar', value: 'Envie `!help` para ver todos os comandos disponíveis', inline: false },
                    { name: '💡 Dica', value: 'Todos os comandos devem ser enviados via DM (mensagem direta)', inline: false }
                )
                .setColor('#5865F2')
                .setTimestamp()
                .setFooter({
                    text: 'Bot Proxy - Sistema de Vendas',
                    iconURL: client.user.displayAvatarURL()
                });
            
            await targetUser.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            console.log('Não foi possível notificar o usuário via DM');
        }
        
    } catch (error) {
        console.error('Erro ao adicionar usuário:', error);
        await message.reply('❌ Erro ao adicionar usuário. Verifique se o ID está correto.');
    }
}

async function handleRemoveUserCommand(message, args) {
    // Verifica se é o dono
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono do bot pode remover usuários autorizados!');
    }
    
    if (args.length < 2) {
        return message.reply('❌ Uso correto: `!removeuser <@usuário>`\nExemplo: `!removeuser @João`');
    }
    
    const userMention = args[1];
    const userId = userMention.replace(/[<@!>]/g, '');
    
    // Não permite remover o próprio dono
    if (userId === process.env.OWNER_ID) {
        return message.reply('❌ Não é possível remover o dono do bot!');
    }
    
    try {
        const targetUser = await client.users.fetch(userId);
        
        if (!targetUser) {
            return message.reply('❌ Usuário não encontrado!');
        }
        
        if (!authorizedUsers.has(userId)) {
            return message.reply(`❌ **${targetUser.username}** não está autorizado a usar o bot!`);
        }
        
        authorizedUsers.delete(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('🚫 Usuário Removido!')
            .setDescription(`**${targetUser.username}** não pode mais usar o bot!`)
            .addFields(
                { name: '👤 Usuário', value: targetUser.username, inline: true },
                { name: '🆔 ID', value: userId, inline: true },
                { name: '📊 Total de Usuários', value: `${authorizedUsers.size} usuários autorizados`, inline: true }
            )
            .setColor('#ff4444')
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp()
            .setFooter({
                text: 'Sistema de Permissões',
                iconURL: client.user.displayAvatarURL()
            });
        
        await message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Erro ao remover usuário:', error);
        await message.reply('❌ Erro ao remover usuário. Verifique se o ID está correto.');
    }
}

async function handleListUsersCommand(message) {
    // Verifica se é o dono
    if (!isOwner(message.author.id)) {
        return message.reply('❌ Apenas o dono do bot pode ver a lista de usuários autorizados!');
    }
    
    if (authorizedUsers.size === 0) {
        return message.reply('❌ Nenhum usuário autorizado encontrado!');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('👥 Usuários Autorizados')
        .setDescription(`Total: **${authorizedUsers.size}** usuários`)
        .setColor('#5865F2')
        .setTimestamp()
        .setFooter({
            text: 'Sistema de Permissões',
            iconURL: client.user.displayAvatarURL()
        });
    
    let userList = '';
    let count = 0;
    
    for (const userId of authorizedUsers) {
        try {
            const user = await client.users.fetch(userId);
            const isOwnerUser = userId === process.env.OWNER_ID;
            const roleIcon = isOwnerUser ? '👑' : '👤';
            const roleText = isOwnerUser ? ' (Dono)' : '';
            
            userList += `${roleIcon} **${user.username}**${roleText}\n🆔 \`${userId}\`\n\n`;
            count++;
            
            // Limita a 10 usuários por embed para não ficar muito longo
            if (count >= 10) {
                embed.addFields({
                    name: '📋 Lista de Usuários',
                    value: userList,
                    inline: false
                });
                
                await message.reply({ embeds: [embed] });
                
                // Reset para próximo embed se houver mais usuários
                userList = '';
                count = 0;
                embed.data.fields = [];
            }
        } catch (error) {
            userList += `❌ **Usuário Inválido**\n🆔 \`${userId}\`\n\n`;
            count++;
        }
    }
    
    // Envia o último embed se houver usuários restantes
    if (userList) {
        embed.addFields({
            name: '📋 Lista de Usuários',
            value: userList,
            inline: false
        });
        
        await message.reply({ embeds: [embed] });
    }
}

// === SISTEMA DE COMPROVANTES DE PAGAMENTO ===

// Função para detectar se uma mensagem contém comprovante de pagamento
function isPaymentProof(message) {
    // Verifica se há anexos (imagens, PDFs, etc.)
    if (message.attachments.size > 0) {
        return true;
    }
    
    // Verifica palavras-chave relacionadas a pagamento
    const paymentKeywords = [
        'comprovante', 'pagamento', 'transferência', 'pix', 'boleto',
        'recibo', 'extrato', 'transação', 'depósito', 'ted', 'doc'
    ];
    
    const content = message.content.toLowerCase();
    return paymentKeywords.some(keyword => content.includes(keyword));
}

// Função para encaminhar comprovante para canal específico
async function forwardPaymentProof(message) {
    try {
        const channelId = process.env.PAYMENT_CHANNEL_ID;
        if (!channelId) {
            console.log('⚠️ PAYMENT_CHANNEL_ID não configurado no .env');
            return;
        }
        
        const targetChannel = await client.channels.fetch(channelId);
        if (!targetChannel) {
            console.log('❌ Canal de comprovantes não encontrado');
            return;
        }
        
        // Busca informações do plano selecionado pelo usuário
        let planInfo = null;
        
        // Primeiro, verifica se há uma seleção pendente
        const pendingSelection = pendingSelections.get(message.author.id);
        if (pendingSelection && pendingSelection.planInfo) {
            planInfo = {
                name: pendingSelection.planInfo.name,
                price: pendingSelection.planInfo.price,
                emoji: pendingSelection.planInfo.emoji
            };
        }
        
        // Se não encontrou na seleção pendente, busca nos pagamentos (incluindo pendentes)
        if (!planInfo) {
            const userPayments = Array.from(payments.entries())
                .filter(([id, payment]) => payment.userId === message.author.id)
                .sort((a, b) => b[1].createdAt - a[1].createdAt);
            
            if (userPayments.length > 0) {
                const latestPayment = userPayments[0][1];
                if (latestPayment.plano) {
                    planInfo = {
                        name: latestPayment.plano,
                        price: latestPayment.valor,
                        emoji: latestPayment.planEmoji || (latestPayment.plano.includes('Standard') ? '🌟' : 
                               latestPayment.plano.includes('Infinity') ? '🚀' : '💎')
                    };
                }
            }
        }
        
        // Cria embed com informações do cliente
        const proofEmbed = new EmbedBuilder()
            .setAuthor({
                name: `💳 Comprovante de Pagamento`,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(`**Cliente:** ${message.author.displayName || message.author.username}\n**ID:** ${message.author.id}\n**Data:** ${new Date().toLocaleString('pt-BR')}`)
            .setColor('#00ff00')
            .setTimestamp();
        
        // Adiciona informações do plano se encontradas
        if (planInfo) {
            // Busca informações do método de pagamento
            const userPayments = Array.from(payments.entries())
                .filter(([id, payment]) => payment.userId === message.author.id)
                .sort((a, b) => b[1].createdAt - a[1].createdAt);
            
            let paymentMethod = 'Não informado';
            if (userPayments.length > 0) {
                paymentMethod = userPayments[0][1].metodo || 'Não informado';
            }
            
            proofEmbed.addFields({
                name: '💎 Plano Selecionado',
                value: `${planInfo.emoji} **${planInfo.name}**\nValor: R$ ${planInfo.price.toFixed(2)}\n💳 Método: ${paymentMethod}`,
                inline: true
            });
        }
        
        // Se houver texto na mensagem, adiciona ao embed
        if (message.content) {
            proofEmbed.addFields({
                name: '📝 Mensagem do Cliente',
                value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content
            });
        }
        
        // Envia o embed
        await targetChannel.send({ embeds: [proofEmbed] });
        
        // Encaminha anexos se houver
        if (message.attachments.size > 0) {
            const attachments = Array.from(message.attachments.values());
            
            for (const attachment of attachments) {
                try {
                    await targetChannel.send({
                        content: `📎 **Anexo de ${message.author.displayName || message.author.username}:**`,
                        files: [attachment.url]
                    });
                } catch (error) {
                    console.error('Erro ao encaminhar anexo:', error);
                    // Tenta enviar apenas o link se falhar
                    await targetChannel.send({
                        content: `📎 **Anexo de ${message.author.displayName || message.author.username}:** ${attachment.url}`
                    });
                }
            }
        }
        
        // Confirma para o cliente que o comprovante foi recebido
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Comprovante Recebido')
            .setDescription('Seu comprovante de pagamento foi recebido e encaminhado para nossa equipe!\n\n📋 **Próximos passos:**\n• Nossa equipe analisará o comprovante\n• Você receberá uma confirmação em breve\n• Em caso de dúvidas, aguarde nosso contato')
            .setColor('#00ff00')
            .setTimestamp();
            
        await message.channel.send({ embeds: [confirmEmbed] });
        
        console.log(`✅ Comprovante encaminhado: ${message.author.username} (${message.author.id})`);
        
    } catch (error) {
        console.error('Erro ao encaminhar comprovante:', error);
    }
}

client.login(process.env.DISCORD_TOKEN);