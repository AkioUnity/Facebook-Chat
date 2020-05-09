let mysql_connection = require("./mysql_connection");

let connection = mysql_connection.pool;
let wp_con = mysql_connection.wp_pool;

module.exports = {
    UpdateWaits: async function (email, status) {
        console.log(email, ":", status);
        let query = "UPDATE waits SET status = '" + status + "' WHERE email = '" + email + "'";
        // console.log(query);
        return await connection.query(query);
    },
    LAMOGA_WAF_request: async function (page_id,message) {
        let query = "select * from LAMOGA_WAF_request WHERE customer_phone = '" + page_id + "'";
        [rows] = await wp_con.query(query);
        if (rows.length==0){  //PIN code is needed.
            query = "select * from LAMOGA_WAF_request WHERE '" + message+ "' like concat('%',consultant_phone,'%')";
            [rows] = await wp_con.query(query);
            if (rows.length==0)  //PIN code is needed.
                return 'What is your PIN code?'
            query = "UPDATE LAMOGA_WAF_request SET customer_phone='"+page_id+"' WHERE id="+rows[0].id;
            await wp_con.query(query);
            return 'Nice! '+rows[0].consultant_name+' will contact you.';
        }
        let sender_id=rows[0].user_id;
        let receiver_id=rows[0].consultant_id;
        let time=new Date().toISOString().replace(/T/,' ').replace(/\..+/, '');
        query = "insert into w_receive_messages (`event`,`text`,sender_id,receiver_id,`time`) values ('facebook','"+message+"',"+sender_id+","+receiver_id+",'"+time+"')";
        // console.log(query);
        await connection.query(query);
        return null;
    },
    showLog: function (aa) {
        console.log(aa);
    }
};
