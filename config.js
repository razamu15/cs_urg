var config = {};

config.PORT = 3000;
config.MYSQL_PORT = 3306;
config.MYSQL_DB = 'cs_urg';
config.MYSQL_USER = 'root';
config.MYSQL_PASS = 'password';
config.REDIS_PORT = 6379;
config.SESSION_TTL = 1200;
config.DIST_OVERLAP = 2;
config.ADMIN_CREDS = { email: 'admin', password: 'UTSC_CS_admin321!' };

module.exports = config;