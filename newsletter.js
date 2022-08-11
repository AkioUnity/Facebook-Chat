let mysql_connection = require("./mysql_connection");
const request = require('request');

let mysql= mysql_connection.newsletter;

module.exports = {
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
    check: async function (page_id, message) {  //page_id:facebook_page_id or Telegram chat_id
        console.log("check",page_id,message);
        if (page_id==null)
            return null;
        let query = "select text from auto_messages WHERE type='telegram'";

        [auto_messages] = await mysql.query(query);

        let findUser = "select * from tokens WHERE telegram_id = '" + page_id + "'";
        [rows] = await mysql.query(findUser);
        if (message=='/halt'){
            if (rows.length == 0) {  // Consultant telegram.
                return "You are not connected.";
            }
            query = "UPDATE tokens SET telegram_id='halt' WHERE id=" + rows[0].id;
            await mysql.query(query);
            return  auto_messages[3].text;//"Ok. You are halted!";
        }
        if (rows.length > 0) {  // Consultant telegram.
            return auto_messages[0].text;  //"Yes. You were already connected!";
        }
        //Check PIN code message

        query = "select * from tokens WHERE '" + message + "' like concat('%',pin_code,'%')";
        [tokens_rows] = await mysql.query(query);

        if (tokens_rows.length>0){  // Consultant PIN code received.
            query = "UPDATE tokens SET telegram_id='" + page_id + "' WHERE id=" + tokens_rows[0].id;
            await mysql.query(query);
            return auto_messages[2].text;  //now you are connected
        }

        return auto_messages[1].text;  //'What is your PIN code?'
    },
    GetConsultantName: async function (page_id) {
        if (page_id==null)
            return '';
        let query = "select value from settings WHERE name = 'send_consultant_name'";
        [rows] = await mysql.query(query);
        if (rows[0].value!='true')
            return '';
        query = "select * from LAMOGA_WAF_request"+wp_portal_id+" WHERE customer_phone = '" + page_id + "'";
        [rows] = await mysql.query(query);
        if (rows.length != 0) {  //PIN code is needed.
            return rows[0].consultant_name;
        }
        return '';
    }
};
