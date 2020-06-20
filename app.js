/**
 * https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start/
 * To run this code, you must do the following:
 * 3. Update the VERIFY_TOKEN
 * 4. Add your PAGE_ACCESS_TOKEN to your environment vars
 *
 */

'use strict';
require('dotenv').config();
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const https = require("https"),
  fs = require("fs");

const options = {
    key: fs.readFileSync("/etc/letsencrypt/live/www.lomago.io/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/www.lomago.io/fullchain.pem")
};
// Imports dependencies and set up http server
const
  request = require('request'),
  express = require('express'),
  body_parser = require('body-parser'),
  app = express().use(body_parser.json()); // creates express http server

// Sets server port and logs message on success
// app.listen(process.env.PORT, () => console.log('webhook is listening '+PAGE_ACCESS_TOKEN));

https.createServer(options, app).listen(process.env.PORT);

let db= require('./db');

// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {

    /** UPDATE YOUR VERIFY TOKEN **/
    const VERIFY_TOKEN = "Lomago_Token";

    // Parse params from the webhook verification request
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Check if a token and mode were sent
    if (mode && token) {

        // Check the mode and token sent are correct
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {

            // Respond with 200 OK and challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);

        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

//https://www.lomago.io:1337/send?text=hello&page_id=3357824640912103
app.get('/send', (req, res) => {
    // Parse params from the webhook verification request
    let page_id = req.query['page_id'];
    let message = req.query['text'];
    sendMessage(page_id,message);
    res.status(200).send(message);
});

//https://www.lomago.io:1337/send?text=hello&page_id=3357824640912103
app.post('/send', (req, res) => {
    let body = req.body;
    sendMessage(body.page_id,body.text);
    db.InsertMessage(body.sender_id,body.receiver_id,body.text);
    res.status(200).send("sent");
});

// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {
    // Parse the request body from the POST
    let body = req.body;
    // Check the webhook event is from a Page subscription
    if (body.object === 'page') {
        body.entry.forEach(function (entry) {
            // Gets the body of the webhook event
            let webhook_event = entry.messaging[0];
            // console.log(entry);
            // Get the sender PSID
            let sender_psid = webhook_event.sender.id;
            // console.log('Sender ID: ' + sender_psid);
            // Check if the event is a message or postback and
            // pass the event to the appropriate handler function
            if (webhook_event.message) {
                console.log(webhook_event);
                handleMessage(sender_psid, webhook_event.message);
            } else if (webhook_event.postback) {
                handlePostback(sender_psid, webhook_event.postback);
            }

        });
        // Return a '200 OK' response to all events
        res.status(200).send('EVENT_RECEIVED');

    } else {
        // Return a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }

});

async function handleMessage(sender_psid, received_message) {
    let response;
    // Checks if the message contains text
    if (received_message.text) {
        //check
        let message = await db.LAMOGA_WAF_request(sender_psid, received_message.text);
        if (message)
            sendMessage(sender_psid, message);
    } else if (received_message.attachments) {
        return;
        // Get 300the URL of the message attachment
        let attachment_url = received_message.attachments[0].payload.url;
        response = {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": [{
                        "title": "Is this the right picture?",
                        "subtitle": "Tap a button to answer.",
                        "image_url": attachment_url,
                        "buttons": [
                            {
                                "type": "postback",
                                "title": "Yes!",
                                "payload": "yes",
                            },
                            {
                                "type": "postback",
                                "title": "No!",
                                "payload": "no",
                            }
                        ],
                    }]
                }
            }
        }
        callSendAPI(sender_psid, response);
    }
    // Send the response message
}

function sendMessage(sender_psid, message) {
    let response= {"text": message };
    callSendAPI(sender_psid, response);
}

function handlePostback(sender_psid, received_postback) {
    console.log('ok')
    let response;
    // Get the payload for the postback
    let payload = received_postback.payload;

    // Set the response based on the postback payload
    if (payload === 'yes') {
        response = {"text": "Thanks!"}
    } else if (payload === 'no') {
        response = {"text": "Oops, try sending another image."}
    }
    // Send the message to acknowledge the postback
    callSendAPI(sender_psid, response);
}

function callSendAPI(sender_psid, response) {
    // Construct the message body
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "message": response
    };

    // console.log(request_body);

    // Send the HTTP request to the Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v2.6/me/messages",
        "qs": {"access_token": PAGE_ACCESS_TOKEN},
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            console.log('message sent!')
        } else {
            console.error("Unable to send message(callSendAPI):" + err);
        }
    });
}
