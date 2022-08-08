let mysql_connection = require("./mysql_connection");

const request = require('request');

let connection = mysql_connection.pool;
let wp_con = mysql_connection.wp_pool;
let wp_portal_id='_17483';
const Type_Facebook = 2;
module.exports = {
    UpdateWaits: async function (email, status) {
        console.log(email, ":", status);
        let query = "UPDATE waits SET status = '" + status + "' WHERE email = '" + email + "'";
        // console.log(query);
        return await connection.query(query);
    },
    InsertMessage: function (sender_id, receiver_id, message, type) {
        let time = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        let query = "insert into w_receive_messages (`event`,`text`,sender_id,receiver_id,`time`) values ('" + type + "','" + message + "'," + sender_id + "," + receiver_id + ",'" + time + "')";
        // console.log(query);
        connection.query(query);

//send Billing Server
        let request_body = {
            sender_id: sender_id,
            receiver_id: receiver_id,  //consultant_id
            text: message,
            type:type
        };

        request({
            "uri": "https://www.lomago.io/whatsapp/api/users/billingServer",
            "method": "POST",
            "json": request_body
        }, (err, res, body) => {
            if (!err) {
                console.log('billingServer message sent!')
                console.log(body);
            } else {
                console.error("Unable to send message:" + err);
            }
            // console.log(res);
        });
    },
    SendTelegramNotification: function (consultant_id, customer_id) {
        let request_body = {
            consultant_id: consultant_id,
            customer_id: customer_id
        };

        request({
            "uri": "https://www.lomago.io/whatsapp/api/users/telegramNotification",
            "method": "POST",
            "json": request_body
        }, (err, res, body) => {
            if (!err) {
                console.log('SendTelegramNotification!')
            } else {
                console.error("Unable to send message:" + err);
            }
            // console.log(res);
        });
    },
    LAMOGA_WAF_request: async function (page_id, message, type) {  //page_id:facebook_page_id or Telegram chat_id
        console.log("LAMOGA_WAF_request",page_id,message,type);
        if (page_id==null)
            return null;

        let query = "select * from LAMOGA_WAF_request"+wp_portal_id+" WHERE customer_phone = '" + page_id + "'";
        [rows] = await wp_con.query(query);
        if (rows.length > 0) {  // found Customer connection
            // new message received.  save the message and send to admin web codeigniter and Gerd's code
            let sender_id = rows[0].user_id;
            let receiver_id = rows[0].consultant_id;
            this.InsertMessage(sender_id, receiver_id, message, type);
            return null;
        }

        //Check PIN code message

        query = "select * from LAMOGA_WAF_request"+wp_portal_id+" WHERE LOCATE(consultant_phone,'" + message + "' )>0 and type='"+type+"'";
        [rows] = await wp_con.query(query);

        query = "select text from auto_messages"+wp_portal_id+" WHERE type='" + type + "' ";
        [reply_rows] = await wp_con.query(query);

        if (rows.length >0) { // Customer PIN code received.
            query = "UPDATE LAMOGA_WAF_request"+wp_portal_id+" SET customer_phone='" + page_id + "' WHERE id=" + rows[0].id;
            await wp_con.query(query);
            let reply = reply_rows[2].text; //'Nice! $consultant will contact you.';
            reply = reply.replace('$consultant', rows[0].consultant_name);

            query="SELECT chatpreis_2,chatpreis_3 from pts_berater_profile"+wp_portal_id+" WHERE ID="+rows[0].consultant_id;
            [prices] = await wp_con.query(query);
            reply = reply.replace('$fb_price', prices[0].chatpreis_2);
            reply = reply.replace('$te_price', prices[0].chatpreis_3);

            this.SendTelegramNotification(rows[0].consultant_id, rows[0].user_id);
            return reply;
        }
        return reply_rows[1].text;  //'What is your PIN code?'
    },
    ConsultantTelegram: async function (page_id, message) {  //page_id:facebook_page_id or Telegram chat_id
        console.log("check",page_id,message);
        if (page_id==null)
            return null;
        let query = "select text from auto_messages"+wp_portal_id+" WHERE type='consultant'";

        [auto_messages] = await wp_con.query(query);

        let findConsultant = "select * from telegram_contacts WHERE chat_id = '" + page_id + "'";
        [rows] = await wp_con.query(findConsultant);
        if (message=='/halt'){
            if (rows.length == 0) {  // Consultant telegram.
                return "You are not connected.";
            }
            query = "UPDATE telegram_contacts SET chat_id='halt' WHERE id=" + rows[0].id;
            await wp_con.query(query);
            return  auto_messages[3].text;//"Ok. You are halted!";
        }
        if (rows.length > 0) {  // Consultant telegram.
            return auto_messages[0].text;  //"Yes. You were already connected!";
        }
        //Check PIN code message

        query = "select * from telegram_contacts WHERE '" + message + "' like concat('%',pin_code,'%')";
        [consultant_rows] = await wp_con.query(query);

        if (consultant_rows.length>0){  // Consultant PIN code received.
            query = "UPDATE telegram_contacts SET chat_id='" + page_id + "' WHERE id=" + consultant_rows[0].id;
            await wp_con.query(query);
            return auto_messages[2].text;  //now you are connected
        }

        return auto_messages[1].text;  //'What is your PIN code?'
    },
    GetConsultantName: async function (page_id) {
        if (page_id==null)
            return '';
        let query = "select value from settings WHERE name = 'send_consultant_name'";
        [rows] = await wp_con.query(query);
        if (rows[0].value!='true')
            return '';
        query = "select * from LAMOGA_WAF_request"+wp_portal_id+" WHERE customer_phone = '" + page_id + "'";
        [rows] = await wp_con.query(query);
        if (rows.length != 0) {  //PIN code is needed.
            return rows[0].consultant_name;
        }
        return '';
    }
};
