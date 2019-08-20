/*
Main express app
*/
// no need to install and include body parser because it was added back into expresss core in verison 4.16 and we are on version 4.17
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');

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

/* so bodyparser was taken out of core express in 4.16 but added back in 4.17 
 * and were using 4.17 do the express.json() methods and shit should've worked
 * but they arent so imma go with the body parser for now */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.set(express.json());
// app.set(express.urlencoded({extended: true}));


// deifne the route that will house all of our static files
app.use(express.static('static'));

// tried sendfile but that doesnt work without setting up __dirname
app.get('/', (req, res) => {
  console.log('mans got a get request on root');
  res.send("this is the root!");
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


// STILL HAVE TO MAKE THE FUNCTINALITY OF MAKING A TEXT ENTRY OPTION IN THE FRONT END JS
// ALSO NEED TO USE THE JQUERY DATA TO SEND QUESTION NUM ALONG WITH CREATION DATA
app.get('/create_survey', async (req, res) => {
  // we shall wait untill we ge the result from the query
  try{
    ques_types_query = await db_call("select * from Question_Types;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  res.render('make_demo');
});

app.post('/create_survey', async (req, res) => {
  console.log(req.body);
  res.send("thanks for making a new survey!");
});

// for this route i will run the query that will get all the surveys for this study
// then use ejs to render in a thingy for each survey and build the link for each
// with the templating
app.get('/study/:study_id', async (req, res) =>{
  console.log("is is the base study page that is going to list all the studies in this");
  res.send(req.params.study_id);
  console.log(req.url);
});

// This is gonna be a simple page with some posts for updating this survey in the DB
app.get('/study/:study_id/survey/:survey_id', async (req, res) =>{
  console.log("this is the url parameter page");
  rere = "study id: " + req.params.study_id;
  rere += "\n survey id: " + req.params.survey_id;
  res.send(rere);
  console.log(req.url);
});

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});

