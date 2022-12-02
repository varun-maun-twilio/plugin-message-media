const TokenValidator = require('twilio-flex-token-validator').functionValidator;
const VError = require('verror');
const waitFor = (delay) => new Promise((resolve) => setTimeout(resolve, delay));


const findCorrelatedChatMessage = async (client, channelSid, mediaSid,startDate) => {

    const retry=5;
    for (let i = 0; i <= retry; i++) {
        
        const recentChatMessages = await client.chat.v2.services(process.env.CHAT_SERVICE_SID)
        .channels(channelSid)
        .messages
        .list({limit: 20, dateSentAfter:startDate});

       
        const correlatedMessage = recentChatMessages.find(x=>x?.media?.sid==mediaSid);

        if(correlatedMessage){
            return correlatedMessage;
        }

        await waitFor(1000);
    }
}


const updateChatMessageAttributes = async (client, channelSid, chatMessageSid,messageBody) => {

    return client.chat.v2.services(process.env.CHAT_SERVICE_SID)
        .channels(channelSid)
        .messages(chatMessageSid)
        .update({attributes:JSON.stringify({body:messageBody})})
        
}


exports.handler = TokenValidator(async function (context, event, callback) {
    const response = new Twilio.Response();
    response.appendHeader('Access-Control-Allow-Origin', '*');
    response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
    response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.appendHeader('Content-Type', 'application/json');

    const { to, mediaUrl, channelSid, mediaSid,messageBody } = event;
    const channel = event.channel && event.channel.toLowerCase();
    const client = context.getTwilioClient();

    const channelsFrom = {
        'chat-whatsapp': `whatsapp:${context.TWILIO_WHATSAPP_NUMBER}`,
        'chat-sms': context.TWILIO_SMS_NUMBER,
    };

    const from = channelsFrom[channel];

    if (!from) {
        console.warn('invalid channel: ', channel);
        response.setStatusCode(400);
        response.setBody(JSON.stringify({ success: false, msg: 'invalid channel' }));
        return callback(null, response);
    }


    try {

        const startDate = new Date();

        const result = await client.messages.create({
            from,
            to,
            mediaUrl,
            body:messageBody
        });
        
        if(messageBody){
            const chatMessage = await findCorrelatedChatMessage(context.getTwilioClient(),channelSid,mediaSid,startDate);
            if(chatMessage){
                await updateChatMessageAttributes(context.getTwilioClient(),channelSid,chatMessage.sid,messageBody);
            }
        }

        response.setBody(JSON.stringify({ success: true }));
        callback(null, response);
    } catch (error) {
        console.error('error creating message:', error);
        response.setBody(JSON.stringify({ success: false, error }));
        callback(response, null);
    }
});
