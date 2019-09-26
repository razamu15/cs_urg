var config = {};

config.PORT = 3000;
config.MYSQL_HOST = 'localhost';
config.MYSQL_PORT = 3306;
config.MYSQL_DB = 'cs_urg';
config.MYSQL_USER = 'root';
config.MYSQL_PASS = 'password';
config.MYSQL_POOL_SIZE = 10;
config.REDIS_PORT = 6379;
config.REDIS_HOST = 'localhost';
config.SESSION_TTL = 1200;
config.DIST_OVERLAP = 2;
config.ADMIN_CREDS = { email: 'admin', password: 'UTSC_CS_admin321!' };
// this variable is the path to the consent document that needs to be displayed when registering
// NOTE: path is relative to being inside the static directory of the project
config.CONSENT_TEXT = "/text/Consent_Form.pdf"

module.exports = config;