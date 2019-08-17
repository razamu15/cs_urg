pacakges not listed in package.json that we will most likely use: 
redis, connect-redis, express-session

to install the packages that ARE currently listed in the package.json
just run npm install in the same directory, these are: express and mysql

the node_mysql,js file is just some testing on working with the 
mysql node js extensions and getting andlooping through the data.

the app.js file is the main web server that is being done by express,
just messing around with directory structure, combining stuff from 
the node_mysql file and using ejs to render an html with databse content.

the create_db sql script can be run on mysql server and it will create 
all the neccessary stuff for you and enter dummy data. I have not craeted
the table that nick asked for(the file to keyword table). Nick can you add
that to the sql script and commit it so we can make it for ourselves too?

the testdb1 is s sqllite database that is very similar to the mysql db in
the script, but i was just using for coming up with a data model, do not 
use it in your development. 

you can view ejs templating in the views folder and there is a separate
static folder right now for any static html pages and css and images when
needed. 

the mysql_cheat_sheet just has some mysql syntax for quick reference. 