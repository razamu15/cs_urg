/*this file is pure node js and using the mysql package to just create 
a sample of how querying with mysql wil work with using async await and promises
a dedicated function that will return a promise to be resolved when the wuery has been executed
*/

// import nessecary pacakges
const http = require('http');
var mysql = require('mysql');

// define the host and the port for the web server
const hostname = '127.0.0.1';
const port = 3000;

// define databse connection object and connet to the mysql database
var dbconn = mysql.createConnection({
  host:'localhost',
  user:'root',
  password:'password',
  database:'test_db'
});

// you pass in an error handling function to the connect function
dbconn.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
  } else {
    console.log('connected to mySQL');
  }
})

function db_call(query_str){
  return new Promise( (resolve, reject) => {
    // execute a sql query to show all users
    dbconn.query(query_str, function (err, result) {
    // if query failed then reject promise otherwise resolve with the data
    if (err) {
      reject("query failed");
    } else {
      resolve(result)
    }
    })
  })
}

// PROMISE ASYNC AWAIT VERSION
const server = http.createServer(async (req, res) => {
  try{
    query_result = await db_call("select * from Question_Types;");
  } catch (err){
    console.log("doesnt matter query works" + err);
  }
  console.log("---------------------");
  for (const row of query_result) {
    console.log(row.label);
    console.log(row.has_text);
    console.log(row.has_options);
    console.log(row.has_file);
    //console.log(row); 
  }
  res.end("done");
});

// start listening
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
