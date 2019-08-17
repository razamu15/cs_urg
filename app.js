/*
Main express app
*/
// no need to install and include body parser because it was added back into expresss core in verison 4.16 and we are on version 4.17
const express = require('express');
const mysql = require('mysql');

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
});

// function that will return a promise you can call await on to wait
// untill the database query is resolved so you can then work with the data
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
};

// create the express app and configure all the middle ware
const app = express();
app.set('view engine', 'ejs');
app.set(express.json());
app.set(express.urlencoded({extended: false}));
// deifne the route that will house all of our static files
app.use(express.static('static'));

app.get('/', (req, res) => {
  console.log('mans got a get request on root');
  res.send("jimmy");
});

app.get('/question_types', async (req, res) => {
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Question_Types;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  // send the query response to render template and render the tempplate using it
  res.render('ques_types');

});


app.get('/bob', (req, res) => {
  console.log('this is bob');
  res.send("hi, i am bob");
});


app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});

