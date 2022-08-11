const mysql = require('mysql2/promise');

let connectionInfo = {
    host: 'localhost',
    user: 'root',
    database: 'chatbot',
    password:'djwth10',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let newsletter_connect = {
    host: 'localhost',
    user: 'root',
    database: 'newsletter',
    password:'djwth10',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let lamoga = {
    host: 'lamoga.de',
    user: 'whatsapp12_admin_8439',
    database: 'wp_portal__whatsapp_chat',
    password:'2ac4tevunu5igI4oDaV5r3V4h23A6i',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};


const pool = mysql.createPool(connectionInfo);
const wp_pool = mysql.createPool(lamoga);
const newsletter= mysql.createPool(newsletter_connect);

module.exports = {pool,wp_pool,newsletter};
