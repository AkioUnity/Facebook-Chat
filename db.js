let mysql_connection = require("./mysql_connection");

const  request = require('request');

let connection = mysql_connection.pool;
let wp_con = mysql_connection.wp_pool;
const Type_Facebook=2;
module.exports = {
    UpdateWaits: async function (email, status) {
        console.log(email, ":", status);
        let query = "UPDATE waits SET status = '" + status + "' WHERE email = '" + email + "'";
        // console.log(query);
        return await connection.query(query);
    },
    InsertMessage: function (sender_id,receiver_id,message,type) {
        let time=new Date().toISOString().replace(/T/,' ').replace(/\..+/, '');
        let query = "insert into w_receive_messages (`event`,`text`,sender_id,receiver_id,`time`) values ('"+type+"','"+message+"',"+sender_id+","+receiver_id+",'"+time+"')";
        // console.log(query);
        connection.query(query);

//send Billing Server
        let request_body = {
            sender_id:sender_id,
            receiver_id:receiver_id,
            text: message
        };

        request({
            "uri": "http://www.lomago.io/whatsapp/api/users/billingServer",
            "method": "POST",
            "json": request_body
        }, (err, res, body) => {
            if (!err) {
                console.log('message sent!')
            } else {
                console.error("Unable to send message:" + err);
            }
            // console.log(res);
        });
    },
    LAMOGA_WAF_request: async function (page_id,message,type) {  //page_id:facebook_page_id or Telegram username
        let query = "select * from LAMOGA_WAF_request WHERE customer_phone = '" + page_id + "'";
        [rows] = await wp_con.query(query);
        if (rows.length==0){  //PIN code is needed.
            query = "select * from LAMOGA_WAF_request WHERE '" + message+ "' like concat('%',consultant_phone,'%')";
            [rows] = await wp_con.query(query);

            query = "select text from auto_messages WHERE type='facebook' ";
            [reply_rows] = await wp_con.query(query);

            if (rows.length==0)  //PIN code is needed.
                return reply_rows[1].text;  //'What is your PIN code?'
            query = "UPDATE LAMOGA_WAF_request SET customer_phone='"+page_id+"' WHERE id="+rows[0].id;
            await wp_con.query(query);
            let reply=reply_rows[2].text; //'Nice! $consultant will contact you.';
            reply=reply.replace('$consultant',rows[0].consultant_name);
            return reply;
        }
        let sender_id=rows[0].user_id;
        let receiver_id=rows[0].consultant_id;
        this.InsertMessage(sender_id,receiver_id,message,type);
        return null;
    },
    showLog: function (aa) {
        console.log(aa);
    }
};
