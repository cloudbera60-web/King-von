const { PayHeroClient } = require('payhero-devkit');
const moment = require('moment-timezone');

// STK Payment Configuration
const stkConfig = {
    PAYHERO_AUTH_TOKEN: process.env.PAYHERO_AUTH_TOKEN || 'Basic blJ1T2lhQXVoNm42Q0w5VWpkUDU6WlVvYk1tQkZRVlNLVWlBd1prOXBLZUpHZDBJM0pMczQxc2hVUldBUg==',
    DEFAULT_PROVIDER: 'm-pesa',
    CHANNEL_ID: process.env.CHANNEL_ID || '3342'
};

// Initialize PayHero Client
let payheroClient = null;
if (stkConfig.PAYHERO_AUTH_TOKEN) {
    try {
        payheroClient = new PayHeroClient({
            authToken: stkConfig.PAYHERO_AUTH_TOKEN
        });
        console.log('✅ PayHero STK Client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize PayHero client:', error.message);
    }
} else {
    console.log('⚠️ PayHero auth token not set. STK payments will not work.');
}

const paymentRequests = new Map();

function formatPhoneNumber(phone) {
    let formattedPhone = phone.trim();
    
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
    }
    
    if (!formattedPhone.startsWith('254')) {
        return null;
    }
    
    return formattedPhone;
}

async function initiateSTKPush(phone, amount, sender, reference = null) {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available. Please contact admin.'
            };
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        
        if (!formattedPhone) {
            return {
                success: false,
                error: 'Phone number must be in format 2547XXXXXXXX or 07XXXXXXXX'
            };
        }
        
        if (parseFloat(amount) <= 0) {
            return {
                success: false,
                error: 'Amount must be greater than 0'
            };
        }
        
        const stkPayload = {
            phone_number: formattedPhone,
            amount: parseFloat(amount),
            provider: stkConfig.DEFAULT_PROVIDER,
            channel_id: stkConfig.CHANNEL_ID,
            external_reference: reference || `GIFTED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            customer_name: sender || 'GIFTED Customer'
        };
        
        console.log('🔄 Initiating STK Push:', {
            phone: formattedPhone,
            amount: amount,
            reference: stkPayload.external_reference
        });
        
        const response = await payheroClient.stkPush(stkPayload);
        
        paymentRequests.set(stkPayload.external_reference, {
            phone: formattedPhone,
            amount: amount,
            sender: sender,
            timestamp: Date.now(),
            status: 'pending',
            lastChecked: null
        });
        
        return {
            success: true,
            message: 'STK push initiated successfully',
            data: response,
            reference: stkPayload.external_reference
        };
    } catch (error) {
        console.error('❌ STK Push Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to initiate STK push'
        };
    }
}

async function checkTransactionStatus(reference) {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available'
            };
        }
        
        const response = await payheroClient.transactionStatus(reference);
        
        if (paymentRequests.has(reference)) {
            const payment = paymentRequests.get(reference);
            payment.status = response.status || 'unknown';
            payment.lastChecked = Date.now();
            paymentRequests.set(reference, payment);
        }
        
        return {
            success: true,
            data: response
        };
    } catch (error) {
        console.error('❌ Transaction Status Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get transaction status'
        };
    }
}

async function getWalletBalance() {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available'
            };
        }
        
        const balance = await payheroClient.serviceWalletBalance();
        return {
            success: true,
            data: balance
        };
    } catch (error) {
        console.error('❌ Wallet Balance Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get wallet balance'
        };
    }
}

function formatSTKMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function handleSTKCommands(socket, message, sender, senderName) {
    try {
        const text = message.conversation || 
                    message.extendedTextMessage?.text || 
                    message.imageMessage?.caption || 
                    '';
        
        if (!text.trim()) return;
        
        const [command, ...args] = text.trim().toLowerCase().split(/\s+/);
        
        console.log(`📩 STK Command: ${command} from ${senderName}`);
        
        // Handle ping command
        if (command === 'ping') {
            const start = Date.now();
            const timestamp = getSriLankaTimestamp();
            const latency = Date.now() - start;
            
            const response = formatSTKMessage(
                '🏓 PONG!',
                `Response Time: ${latency}ms\nServer Time: ${timestamp}\nConnection: ✅ Active\nUptime: ${process.uptime().toFixed(2)}s`,
                'GIFTED Payment Bot'
            );
            
            await socket.sendMessage(sender, { text: response });
            return;
        }
        
        // Handle send command
        if (command === 'send') {
            if (args.length < 1) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Command',
                        'Usage: send <amount>,<phone>\nExample: send 100,254712345678\n\nOr: send <amount>\n(Will use your WhatsApp number)\n\nType "menu" for more commands',
                        'GIFTED Payment Bot'
                    )
                });
                return;
            }
            
            let amount, phone;
            
            // Check if command format is "send 100,254712345678"
            if (args[0].includes(',')) {
                [amount, phone] = args[0].split(',');
            } else {
                amount = args[0];
                // If no phone provided, use sender's number
                phone = sender.split('@')[0];
            }
            
            // Validate amount
            if (isNaN(amount) || parseFloat(amount) <= 0) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Amount',
                        'Please enter a valid amount greater than 0\nExample: send 100',
                        'GIFTED Payment Bot'
                    )
                });
                return;
            }
            
            // Send processing message
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '🔄 Processing Payment',
                    `Amount: KES ${amount}\nPhone: ${phone}\n\nPlease wait while we process your request...`,
                    'GIFTED Payment Bot'
                )
            });
            
            // Initiate STK Push
            const result = await initiateSTKPush(phone, amount, senderName);
            
            if (result.success) {
                const responseMessage = formatSTKMessage(
                    '✅ Payment Request Sent',
                    `Amount: KES ${amount}\nPhone: ${phone}\nReference: ${result.reference}\n\nCheck your phone for M-Pesa prompt and enter your PIN to complete payment.\n\nUse: status ${result.reference} to check payment status.`,
                    'GIFTED Payment Bot'
                );
                
                await socket.sendMessage(sender, { text: responseMessage });
                
                // Send reminder after 30 seconds
                setTimeout(async () => {
                    if (paymentRequests.get(result.reference)?.status === 'pending') {
                        await socket.sendMessage(sender, {
                            text: formatSTKMessage(
                                '⏰ Payment Reminder',
                                `Payment request for KES ${amount} is still pending.\nCheck your phone for M-Pesa prompt.`,
                                'GIFTED Payment Bot'
                            )
                        });
                    }
                }, 30000);
                
            } else {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Payment Failed',
                        `Error: ${result.error}\n\nPlease check:\n1. Phone number format (2547XXXXXXXX)\n2. Amount is valid\n3. Try again in a moment`,
                        'GIFTED Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle status command
        if (command === 'status') {
            if (args.length < 1) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Command',
                        'Usage: status <reference>\nExample: status GIFTED-123456789\n\nCheck your payment reference from the payment confirmation.',
                        'GIFTED Payment Bot'
                    )
                });
                return;
            }
            
            const reference = args[0];
            
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '🔄 Checking Status',
                    `Reference: ${reference}\n\nPlease wait...`,
                    'GIFTED Payment Bot'
                )
            });
            
            const result = await checkTransactionStatus(reference);
            
            if (result.success) {
                const statusData = result.data;
                let statusMessage = '';
                
                if (statusData.status === 'successful') {
                    statusMessage = `✅ *Payment Successful!*\n\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}\nTime: ${statusData.timestamp || getSriLankaTimestamp()}\n\nThank you for your payment!`;
                } else if (statusData.status === 'pending') {
                    statusMessage = `⏳ *Payment Pending*\n\nPlease check your phone and enter M-Pesa PIN to complete payment.\n\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}`;
                } else if (statusData.status === 'failed') {
                    statusMessage = `❌ *Payment Failed*\n\nReason: ${statusData.reason || 'Unknown'}\nAmount: KES ${statusData.amount || 'N/A'}\n\nPlease try again or contact support.`;
                } else {
                    statusMessage = `ℹ️ *Payment Status*\n\nStatus: ${statusData.status || 'Unknown'}\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}\nLast Updated: ${getSriLankaTimestamp()}`;
                }
                
                await socket.sendMessage(sender, { text: statusMessage });
            } else {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Status Check Failed',
                        `Error: ${result.error}\n\nPlease check the reference number and try again.`,
                        'GIFTED Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle balance command
        if (command === 'balance') {
            try {
                const result = await getWalletBalance();
                
                if (result.success) {
                    await socket.sendMessage(sender, {
                        text: formatSTKMessage(
                            '💰 Wallet Balance',
                            `Account: ${stkConfig.CHANNEL_ID}\nBalance: ${result.data.amount || 'N/A'} ${result.data.currency || 'KES'}\n\nLast Updated: ${getSriLankaTimestamp()}`,
                            'GIFTED Payment Bot'
                        )
                    });
                } else {
                    await socket.sendMessage(sender, {
                        text: formatSTKMessage(
                            '❌ Balance Check Failed',
                            `Error: ${result.error}\n\nPlease try again later.`,
                            'GIFTED Payment Bot'
                        )
                    });
                }
            } catch (error) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Balance Check Failed',
                        `Error: ${error.message}\n\nPlease try again later.`,
                        'GIFTED Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle menu command
        if (command === 'menu') {
            const commands = `
*Available Commands (No prefix needed):*

*️⃣ *Payment Commands:*
• send <amount>,<phone> - Send STK Push payment request
• send <amount> - Send payment to your own number
• status <reference> - Check payment status

*️⃣ *Utility Commands:*
• ping - Check bot response time
• balance - Check PayHero wallet balance
• menu - Show this help message

*️⃣ *Examples:*
• send 100 - Pay KES 100 to your number
• send 500,254712345678 - Pay KES 500 to 254712345678
• status GIFTED-123456789 - Check payment status

*Note:* Just type the command without any dot or symbol.
            `.trim();
            
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '📚 GIFTED Payment Bot Menu',
                    commands,
                    'Type any command to get started'
                )
            });
            return;
        }
        
        // Handle unknown command
        if (!['send', 'status', 'balance', 'ping', 'menu'].includes(command) && command) {
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '❌ Unknown Command',
                    `Command "${command}" not recognized.\n\nType "menu" to see available commands.`,
                    'GIFTED Payment Bot'
                )
            });
        }
        
    } catch (error) {
        console.error('❌ STK Command handler error:', error);
    }
}

module.exports = {
    initiateSTKPush,
    checkTransactionStatus,
    getWalletBalance,
    formatSTKMessage,
    getSriLankaTimestamp,
    handleSTKCommands,
    paymentRequests,
    payheroClient,
    stkConfig
};
