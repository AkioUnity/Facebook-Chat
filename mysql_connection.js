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
    user: 'stuedemann_admin_913',
    database: 'wp_portal_stuedemann_lamoga',
    password:'656ekEpIl2QEkEL1C8hir8zAleL7me',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};


const pool = mysql.createPool(connectionInfo);
const wp_pool = mysql.createPool(lamoga);

module.exports = {pool,wp_pool};
