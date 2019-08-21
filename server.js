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


app.get('/create_survey', async (req, res) => {
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Question_Types;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  res.render('make_survey', { ques_types_query : query_result });
});

app.post('/create_survey', async (req, res) => {
  console.log(req.body);
  console.log(req.body.length);
  res.send("thanks for making a new survey!");
});

app.get('/adminhome', async (req, res) =>{
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Studies;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  // here we will list all the studies that are active and use the query to render in the html properly
  res.render("admin_home", { query_result:query_result });
})

// for this route i will run the query that will get all the surveys for this study
// then use ejs to render in a thingy for each survey and build the link for each
// with the templating
app.get('/adminhome/study/:study_id', async (req, res) =>{
  // use the url parameter to get the all the surveys for the needed study
  try{
    query_result = await db_call(`select * from Surveys where study_id = ${req.params.study_id};`);
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  // query the database to get all the surveys that belong to the id req.params.study_id
  console.log(req.params.study_id);
  res.render("survey");
  
});

// This is gonna be a simple page with some posts for updating this survey in the DB
app.get('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  // use the post form data and req.params.survey_id to update this survey's record in the DB
  console.log("update the expiry, publish or delete this survey: ", req.params.survey_id);
  res.send("study id: " + req.params.study_id + "\n survey id: " + req.params.survey_id);
});

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});

