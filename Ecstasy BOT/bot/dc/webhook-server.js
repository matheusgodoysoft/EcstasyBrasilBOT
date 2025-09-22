const express = require('express');
const crypto = require('crypto');

class WebhookServer {
    constructor(client, payments) {
        this.client = client;
        this.payments = payments;
        this.app = express();
        this.port = process.env.WEBHOOK_PORT || 3000;
        this.paymentUserMappings = new Map(); // Mapeia paymentId -> userId

        // Middleware para parsing JSON
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
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