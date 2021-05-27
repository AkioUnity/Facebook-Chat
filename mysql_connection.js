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

module.exports = {pool,wp_pool};
