const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const redis = require('redis');
const session = require('express-session');
const redisStore = require('connect-redis')(session);
const PORT = 3000;


// define databse connection object and connet to the mysql database
var dbconn = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'password',
    database:'CS_URG'
});
// define the redis client
var redisClient = redis.createClient();

// create the express app and configure all the middle ware
const app = express();

app.set('view engine', 'ejs');
/* so bodyparser was taken out of core express in 4.16 but added back in 4.17 
 * and were using 4.17 do the express.json() methods and shit should've worked
 * but they arent so imma go with the body parser for now */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// define the static folder route for our css and image files
app.use(express.static('static'));
// define and configure redis as our session store
app.use(session({
  store: new redisStore({
    host: 'localhost', 
    port: 6379,
    client: redisClient,
    ttl: 1200
  }),
  secret: "ahhheeeeahlieseeendawger",
  saveUninitialized: false,
  resave: false
}));

// connect to the MySQL database
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


// ###########################################################################
// ---------------------------------------------------------------------------
// ##################### APPLICATION ROUTES AND LOGIC ########################
// ---------------------------------------------------------------------------
// ###########################################################################


app.get('/', (req, res) => {
  if (req.session.user_id == 'admin') {
    res.redirect('/adminhome');  
  } else if (req.session.user_id) {
    res.redirect('/userhome');  
  } else {
    res.render('pages/external_view');
  }
})

app.get('/login', (req, res) => {
  // check if this session has a user_id which means it has already been authenticated
  // and redirect based on which type of user it is
  if (req.session.user_id == 'admin') {
    res.redirect('/adminhome');  
  } else if (req.session.user_id) {
    res.redirect('/userhome');
  } else {
    // show them the login page
    res.render('pages/login', {message: "Please enter your email and password"});
  }
})

// what the session middleware essentially does is it automatically stores any session 
// that was changed or had data added to it in redis, and whenecer you try to access a session
// it looks for it in redis and if its there gives you back the modified session ow it gives
// the browser default session which would be an unauthorized user
app.post('/login', async (req, res) => {
  // special login case for an admin account
  admin_login = { email: 'admin', password: 'UTSC_CS_admin321!'};
  if (req.body.email == admin_login.email && req.body.password == admin_login.password) {
    // add their info to session which will automatically be stored in redis
    req.session['user_id'] = admin_login.email;
    req.session['email'] = admin_login.email;
    res.redirect('/adminhome');
    return;
  } 

  // first we run the query on the database to get the relevant information for this user
  user_query = `select * from Users where email = "${req.body.email}"`;
  user_result = await db_call(user_query);
  // check if the email was correct so that we actually found a matching row in the db
  if (user_result.length == 0) {
    res.render('pages/login', {message: "Incorrect email"});
    return;
  } else {
    user_result = user_result[0];
  }
  // we then check if the credentials are correct and if they are, we will create a session for them
  if (user_result.password == req.body.password) {
    // add their info to session which will automatically be stored in redis
    req.session['user_id'] = user_result.user_id;
    req.session['email'] = user_result.email;
    // now we direct them to the dashboard
    res.redirect('/userhome');
  } else {
    // we render login page again but give a error message saying wrong password
    res.render('pages/login', {message: "Incorrect password"});
  }
})

app.get('/logout', (req, res) =>{
  // check if there is a session in the first place to destory 
  if (req.session.user_id) {
    req.session.destroy();
    res.redirect('/');
  } else {
    res.redirect('/');
  }
})

app.get('/register', (req, res) => {
  // check if this session has a user_id which means it has already been authenticated
  // and redirect based on which type of user it is
  if (req.session.user_id == 'admin') {
    res.redirect('/adminhome');  
  } else if (req.session.user_id) {
    res.redirect('/userhome');
  } else {
    // show them the login page
    res.render('pages/register', {message: "Please enter an email and password to register"});
  }
})

app.post('/register', async (req, res) => {
  // define the query and fill it with the information from the post request
  insert_query = `insert into Users (email, password, is_active, gender) values ("${req.body.email}", "${req.body.password}", 1, "${req.body.gender}");`;
  // we run the query on the databse but if there is a unique email violation then the function will throw an error
  try{
    result = await db_call(insert_query);
  } catch (err) {
    console.log(err);
    res.render('pages/register', {message: "Unable to create user, email already in use"});
    return;
  }
  // if the query is ok then the user was creted and we redirect hem to the login page
  res.redirect('/login');
})

app.get('/contact', (req, res) =>{
  if (req.session.user_id == 'admin') {
    res.render('pages/contact_view', {action: "logout", home:"adminhome"}); 
  } else if (req.session.user_id) {
    res.render('pages/contact_view', {action: "logout", home:"userhome"});
  } else {
    res.render('pages/contact_view', {action: "login", home:""});
  }
})

app.get('/userhome', async (req, res) => {
  // this page is not accessible if not signed in
  if (!req.session.user_id) {
    res.redirect('/login');
    return;
  } else if (req.session.user_id == "admin") {
    res.redirect('/adminhome');
    return;
  } else {
    user_id = req.session.user_id;
  }
  // first we gott run the query for all the surveys that are active ie(publised and not expired)
  survey_query = `select * from Surveys where survey_id not in (select survey_id from Completed_Surveys where user_id = ${user_id} and is_round = 0) and expiry_date > curdate() and is_published = 1;`;
  try{
    active_surveys = await db_call(survey_query);
  } catch (err) {
    console.log(survey_query, "failed");
  }
  // finally we render the template with any surveys that have not yet been answered by this user
  res.render('pages/user_home', { available_surveys: active_surveys})
})

app.get('/userhome/survey/:survey_id', async (req, res) =>{
  // this page is not accessible if not signed in
  if (!req.session.user_id) {
    res.redirect('/login');
    return;
  } else if (req.session.user_id == "admin") {
    res.redirect('/');
    return;
  } else {
    user_id = req.session.user_id;
  }
  // natural join the survey with the questions with the question options then order by ques_id then op_id
  questions_query = ` select all_ques.ques_id, ques_type_id, ques_order_num, ques_count, title, info, op_id, label, text_associated from (select Questions.survey_id, ques_id, ques_type_id, ques_count, ques_order_num, Questions.title, Questions.info from Surveys inner join Questions on Surveys.survey_id = Questions.survey_id) as all_ques left join Options on Options.ques_id = all_ques.ques_id where survey_id = ${req.params.survey_id} order by all_ques.ques_order_num, op_id;`;
  survey_query = `select * from Surveys where survey_id = ${req.params.survey_id}`
  
  try{
    // execute all three queries on the database
    questions = await db_call(questions_query);
    survey = await db_call(survey_query);
    qtypes= await db_call("select * from Question_Types;");
  } catch (err) {
    console.log(survey_query, "failed");
    console.log("or", qtypes_query, "failed");
  }
  
  // now that we have the data that we need from the databse, we will format and categorize it into arrays and objects 
  // so that its easier to render on the webpage
  qtypes_json = {}
  for (const row of qtypes) {
    qtype_obj = {...row};
    qtypes_json[row.ques_type_id] = qtype_obj;
  }
  // now we deal with the survey data
  survey_results = survey[0];
  ques_array = [];
  // loop through all the rows from the questions query and create sets of json data
  // for each question which will then be rnedered by the front end
  for (const ques_row of questions) {
    // check if the array is big enough for this ques num
    qnum = +ques_row.ques_order_num;
    if ( qnum == ques_array.length) {
      // then we need to append a new object for this question to the ques array
      // we copy over all the ques info from the query result directly and add the option
      // list and fill it if needed
      ques_obj = {...ques_row};
      ques_obj['options'] = [];
      if (ques_row.op_id != null){
        opt_obj = {};
        opt_obj['id'] = ques_row.op_id;
        opt_obj['label'] = ques_row.label;
        opt_obj['text_associated'] = ques_row.text_associated;
        ques_obj['options'].push(opt_obj);
      }
      // now delete the properties of the ques object we dont need
      delete ques_obj.op_id;
      delete ques_obj.label;
      delete ques_obj.text_associated;
      // now add this ques obj to the array
      ques_array.push(ques_obj);
    } else {
      // there is already an object in the array for this question which means that 
      // we need to add the extra option information to the options list
      // get the predfined option array
      ques_opt_array = ques_array[qnum].options;
      // define and fill new option obj and push it to the array inside of the ques obj
      opt_obj = {};
      opt_obj['id'] = ques_row.op_id;
      opt_obj['label'] = ques_row.label;
      opt_obj['text_associated'] = ques_row.text_associated;
      ques_opt_array.push(opt_obj);
    }
  }
  // after all that stuff we check if this survey was a round or not and then render the appropriate page
  if (+survey_results.is_round == 1) {
    res.render('pages/answer_round', {survey: survey_results, questions:ques_array, qtypes: qtypes_json, survey_id:req.params.survey_id});
  } else {
    res.render('pages/answer_survey', {survey: survey_results, questions:ques_array, qtypes: qtypes_json, survey_id:req.params.survey_id});
  }
  
})

app.post('/userhome/survey/:survey_id', async (req, res) =>{
  if (!req.session.user_id) {
    res.sendStatus(401);
    return;
  } else if (req.session.user_id == "admin") {
    res.sendStatus(403);
    return;
  } else if (req.session.email == "userview") {
    res.sendStatus(200);
    return;
  }
  file_fill = req.body.file_id;
  text = req.body.text;
  opt_id = req.body.opt;
  opt_text = req.body.opt_text;
  // define and fill in the response insert query
  insert_query = `insert into Responses (ques_id, file_id, user_id, op_id, op_text, text_resp, time_started, time_ended) values (${req.body.ques_id}, ${file_fill ? file_fill : "NULL"}, ${req.session.user_id}, ${opt_id ? opt_id : "NULL"}, "${opt_text ? opt_text : "NULL"}", "${text ? text : "NULL"}", "${req.body.start_time}", "${req.body.end_time}");`;

  // execute it on the database
  try {
    ins_result = await db_call(insert_query);
    res.sendStatus(200);
  } catch (err) {
    console.error("failed to insert response in the db", insert_query);
    res.sendStatus(501);
  }
})

app.post('/userhome/survey_complete/:survey_id', async (req, res) =>{
  // check session
  if (!req.session.user_id) {
    res.sendStatus(401);
    return;
  } else if (req.session.user_id == "admin") {
    res.sendStatus(403);
    return;
  } else if (req.session.email == "userview") {
    res.sendStatus(200);
    return;
  }
  // we difine and run the query that will mark this survey as completed for this user
  finish_query = `insert into Completed_Surveys (user_id, survey_id, completion_date, is_round) values (${req.session.user_id}, ${req.params.survey_id}, curdate(), 0);`;
  try {
    result = await db_call(finish_query);
    res.sendStatus(200);
  } catch (error) {
    console.log("query to mark survey completed, failed", finish_query);
    res.sendStatus(501);
  }
})

app.post('/userhome/round_complete/:survey_id', async (req, res) =>{
  // check session
  if (!req.session.user_id) {
    res.sendStatus(401);
    return;
  } else if (req.session.user_id == "admin") {
    res.sendStatus(403);
    return;
  } else if (req.session.email == "userview") {
    res.sendStatus(200);
    return;
  }
  // we difine and run the query that will mark this survey as completed for this user
  finish_query = `insert into Completed_Surveys (user_id, survey_id, completion_date, is_round) values (${req.session.user_id}, ${req.params.survey_id}, curdate(), 1);`;
  try {
    result = await db_call(finish_query);
    res.sendStatus(200);
  } catch (error) {
    console.log("query to mark survey completed, failed", finish_query);
    res.sendStatus(501);
  }
})

app.get('/getfile/ques/:ques_id', async (req, res) =>{
  // check session
  if (!req.session.user_id) {
    res.sendStatus(401);
    return;
  } else if (req.session.user_id == "admin") {
    res.sendStatus(403);
    return;
  } else if (req.session.email == "userview") {
    res.sendStatus(200);
    return;
  }
  // first we run the query to get any files that have been answered at least once but not enough times
  response_overlap = 2;
  parital_query = `select Files.file_id, link, partials.count from (select * from Files_in_Use where ques_id = ${req.params.ques_id} and count < ${response_overlap}) as partials inner join Files on Files.file_id = partials.file_id;`;
  try{
    partial_results = await db_call(parital_query);
  } catch (err) {
    console.log("error in first query", parital_query);
    // the file was not marked inactive, something went wrong
    res.sendStatus(501);
    return;
  }
  // if there are not enough results(1 is always enough but we do more for randomization), then we get a "fresh" file
  if (partial_results.length < 5) {
    fresh_query = `select Files.file_id, link from Files where Files.file_id not in (select file_id from Files_in_Use where ques_id = ${req.params.ques_id} and count <= ${response_overlap});`;
    try{
      fresh_results = await db_call(fresh_query);
    } catch (err) {
      console.log("error in fresh query", fresh_query);
      // the file was not marked inactive, something went wrong
      res.sendStatus(501);
      return;
    }
    // if there are no fresh files, then we revert back to the partially done files and send one of those
    if ( fresh_results.length != 0 ){
      // pick a random row from the new result
      rand_int = Math.floor(Math.random() * (fresh_results.length - 1 - 0 + 1) + 0);
      return_row = fresh_results[rand_int];
      // insert it into the Files_in_Use table with count = 1;
      ins_query = `insert into Files_in_Use (file_id, ques_id, count) values (${return_row.file_id}, ${req.params.ques_id}, ${1});`;
      // wait for this file to be marked in use because we dont want to serve the same file to more people than needed
      try {
        insert_res = await db_call(ins_query);
        // return with the query data
        res.json(return_row);
        return;
      } catch (error) {
        console.log("error in partial wuery", ins_query);
        // the file was not marked inactive, something went wrong
        res.sendStatus(501);
        return;
      }
    } else {
      // we also wanna check here if the partial query return no files then theres nothing more to give
      if (partial_results.length == 0){
        res.sendStatus(422);
        return;
      }
      // there are no more frassh files left so we fall back ot the partial ones
      // pick a random file from the list and return its info
      rand_int = Math.floor(Math.random() * (partial_results.length - 1 - 0 + 1) + 0);
      return_row = partial_results[rand_int];
      // update its info and add 1 to its count in the Files_in_Use table
      upd_query = `update Files_in_Use set count = ${ +return_row.count + 1} where file_id = ${return_row.file_id} and ques_id = ${req.params.ques_id};`;
      // wait for this file to be marked in use because we dont want to serve the same file to more people than needed
      try {
        upd_result = await db_call(upd_query);
        // return with the query data
        res.json(return_row);
        return;
      } catch (error) {
        console.log("error in updated query");
        // the file was not marked inactive, something went wrong
        res.sendStatus(501);
        return;
      }
    }
  } else {
    // pick a random file from the list and return its info
    rand_int = Math.floor(Math.random() * (partial_results.length - 1 - 0 + 1) + 0);
    return_row = partial_results[rand_int];
    // update its info and add 1 to its count in the Files_in_Use table
    upd_query = `update Files_in_Use set count = ${ +return_row.count + 1} where file_id = ${return_row.file_id} and ques_id = ${req.params.ques_id};`;
    // wait for this file to be marked in use because we dont want to serve the same file to more people than needed
    try {
      upd_result = await db_call(upd_query);
      // return with the query data
      res.json(return_row);
      return;
    } catch (error) {
      console.log("error in updated wuery");
      // the file was not marked inactive, something went wrong
      res.sendStatus(501);
      return;
    }
  }
})

app.get('/adminhome', async (req, res) =>{
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Studies;");
  } catch (err){
    console.log("query to get all studies failed", err);
    res.send("something went wrong");
  }
  // here we will list all the studies that are active and use the query to render in the html properly
  res.render("pages/admin_home", { studies:query_result });
})

app.get('/adminhome/study/:study_id', async (req, res) =>{
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // use the url parameter to get the all the surveys for the needed study
  try{
    query_result = await db_call(`select * from Surveys where study_id = ${req.params.study_id};`);
  } catch (err){
    console.log("query to get all surveys for a study failed", err);
    res.send("something went wrong");
  }
  res.render("pages/study_view", {study_id : req.params.study_id, surveys: query_result});
})

app.post('/adminhome/create_study', async (req, res) => {
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // take the info from the request body, and put it in the sql query
  study_query = `insert into Studies (title, info, is_active) values ("${req.body.title}", "${req.body.info}", 1);`
  // execute the sql query
  try {
    ins_result = await db_call(study_query);
  } catch (err) {
    console.error("failed to create new study", study_query);
  }
  res.redirect('/adminhome');
})

app.get('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // run the db query and get all the data we need for this survey
  try{
    query_result = await db_call(`select * from Surveys where survey_id = ${req.params.survey_id};`);
  } catch (err){
    console.log("query to get details for a survey failed" + err);
    res.send("something went wrong");
  }
  res.render("pages/survey_view", {survey_info : query_result[0], study_id: req.params.study_id, survey_id:req.params.survey_id});
})

app.post('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // i need to check if the 2 items from the request body are empty or not and build the query accordingly
  pub_update = (req.body.is_published != "");
  exp_update = (req.body.expiry_date != "");
  if (pub_update && exp_update) {
    update_query = `update Surveys set is_published = "${req.body.is_published}", expiry_date = "${req.body.expiry_date}" where survey_id = ${req.params.survey_id}`;
  } else {
    update_query = `update Surveys set ${ pub_update ? "is_published = '" + req.body.is_published + "'" : "expiry_date = '" + req.body.expiry_date + "'"} where survey_id = ${req.params.survey_id};`;
  }
  // execute the db query to update the db
  try{
    result = await db_call(update_query);
  } catch (err) {
    console.error(update_query, "failed");
  }
  res.redirect(`/adminhome/study/${req.params.study_id}/survey/${req.params.survey_id}`);
})

app.post('/reset/survey/:survey_id', async (req, res) => {
  // this action is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.sendStatus(401);
    return;
  }
  // now i delete all the answers that belong to any question in this survey
  answers_rem = `delete from Responses where ques_id in (select ques_id from Questions where survey_id = ${req.params.survey_id});`;
  // also delete records of any files that were used by questions in this survey
  files_rem = `delete from Files_in_Use where ques_id in (select ques_id from Questions where survey_id = ${req.params.survey_id});`;
  // also delete any records for people that have already completed this survey
  completes_rem = `delete from Completed_Surveys where survey_id = ${req.params.survey_id};`;
  try {
    // if the queries succeeded, then we send a success status code ow we send a fail status code
    result = await Promise.all([db_call(answers_rem), db_call(files_rem), db_call(completes_rem)]);
    res.sendStatus(200);
  } catch (err) {
    console.error("survey reset failed");
    res.sendStatus(501);
  }
})

app.post('/delete/survey/:survey_id', async (req, res) => {
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.sendStatus(401);
    return;
  }
  // first i remove all the options that are about any questions related to the survey
  option_rem = `delete from Options where ques_id in (select ques_id from Questions where survey_id = ${req.params.survey_id});`;
  // next remove all the questions themselves
  ques_rem = `delete from Questions where survey_id = ${req.params.survey_id};`;
  // now finally remove the survey itself
  surv_rem = `delete from Surveys where survey_id = ${req.params.survey_id};`;
  let fail_counter = 0;
  try {
    result = await db_call(option_rem);
    fail_counter += 1;
    result = await db_call(ques_rem);
    fail_counter += 1;
    result = await db_call(surv_rem);
    fail_counter += 1;
    res.sendStatus(200);
  } catch (err) {
    // we print out which db call failed
    console.error("Failed to remove the survey properly");
    if ( fail_counter == 0 ) {
      console.error(option_rem, "failed");
    } else if (fail_counter == 1) {
      console.error(ques_rem, "failed");
    } else {
      console.error(surv_rem, "failed");
    }
    res.sendStatus(501);
  }
});

app.get('/adminhome/study/:study_id/create_survey', async (req, res) => {
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Question_Types;");
  } catch (err){
    console.error("question Types query failed" + err);
    res.redirect(`/adminhome/study/${req.params.study_id}/`);
    return;
  }
  res.render('pages/make_survey', { ques_types_query : query_result, study_id: req.params.study_id });
});

app.get('/adminhome/study/:study_id/create_round', async (req, res) => {
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Question_Types where has_file = 1;");
  } catch (err){
    console.error("question Types query failed" + err);
    res.redirect(`/adminhome/study/${req.params.study_id}/`);
    return;
  }
  res.render('pages/make_round', { ques_types_query : query_result, study_id: req.params.study_id });
});

// this function calculates the ques_count if we want to distribute the files evenly between all users.
async function get_distributed_value() {
  // get the active file count and the active user count
  file_count = await db_call("select COUNT(*) from Files where is_active = 1;");
  user_count = await db_call("select COUNT(*) from Users where is_active = 1;");
  file_count = file_count[0]['COUNT(*)'];
  user_count = user_count[0]['COUNT(*)'];
  result = Math.ceil(file_count/user_count);
  // we wanna make sure we dont return infinity or zero as a our ques_count
  if (result == 0 || !isFinite(result)) {
    return 1;
  } else {
    return result; 
  }
}

app.post('/adminhome/study/:study_id/create_survey', async (req, res) => {
  // this page is not accessible if not signed in as admin
  if (req.session.user_id != "admin") {
    res.redirect('/');
    return;
  }
  // we will first loop through the raw form data and sort it into arrays and objects for
  // then once we have our data organized by questions and options, we run our sql queries
  // by formatting strings with the data

  // define the data structures that we will sort raww form data into
  survey_info = {};
  ques_array = []; // empty object in the start to be able to start count of array at index 1
  options_array = [];
  var cur_ques;
  // loop through all the form data using this for-in loop
  // We figure out what type of data it is and where it belongs using the key
  for (const data_key in req.body) {
    if (req.body.hasOwnProperty(data_key)) {
      element = req.body[data_key];
    }
    // check the first character and the last character to if this is a question, option or survey data
    if ( isNaN(+data_key[0]) ) {
      // this data is for the survey as a whole, so just add the key value pair
      survey_info[data_key] = element;
    } else if ( !isNaN(+data_key.slice(-1))) {
      // this is data for a singular option
      // we create a new object and fill it in with the relevant info for this option
      op_info = {};
      // we also store the ques number so that i can find the actual ques_id foreign key later on
      op_info["qnum"] = +data_key[0];
      // add the label for this option
      op_info["label"] = element;
      // there are 2 types of options we need to deal with here
      opt_type = data_key.split("_")[1];
      if (opt_type == "op") {
        // this means this option doesnt have text associated with it
        op_info["text_associated"] = 0;
      } else {
        // ow this is a text entry option
        op_info["text_associated"] = 1;
      }
      // add the object to our array
      options_array.push(op_info);
    } else {
      // this is data for a ques
      // if this data is for a new ques than the current one, then we will make a new entry in the array
      ques_num = +data_key[0];
      data_label = data_key.split("_")[1];
      if ( ques_num != cur_ques ) {
        // append a new object for this question to the questions array
        ques_array.push({});
        cur_ques = ques_num;
        // now we add this first peice of data for this question to the object
        ques_array[cur_ques][data_label] = element;
        // also add the order number for this question object we just created
        ques_array[cur_ques]["qnum"] = ques_num;
      } else {
        // the current peice of data belongs to the current ques, so we insert it in its proper object
        ques_array[cur_ques][data_label] = element;
      }
    }
  }
  // now that we have all out data placed in these structures, we can go through them and add stuff in order
  
  // run the query for the survey first since the question needs to refer to it with a foreign key
  survey_insert = `insert into Surveys (study_id, title, info, expiry_date, is_published, is_round) values (${req.params.study_id}, "${survey_info.surv_title}", "${survey_info.surv_info}", NULL, 0, ${survey_info.is_round});`;
  // wrap the query in try catch in case if promise is rejected
  try{
    ins_result = await db_call(survey_insert); 
  } catch (err) {
    console.error("Survey creation query failed", survey_insert);
    res.redirect(`/adminhome/study/${req.params.study_id}/`);
  }
  // before we can continue we need to get the survey_id that was automatically generated by the db
  // when the survey insert was done because it is needed for the foreign key contraint of the questions
  // we can get the unique survey id for the survey we just created by using the study id and the survey title
  survey_id_query = `select survey_id from Surveys where study_id = "${req.params.study_id}" and title = "${survey_info.surv_title}";`;
  try{
    survey_id = await db_call(survey_id_query);
    // extract the actual value from the query result array
    survey_id = survey_id[0].survey_id;
  } catch (err) {
    console.error("Survey id query after creation failed", survey_id_query);
    res.redirect(`/adminhome/study/${req.params.study_id}/`);
  }

  // since there can be questions we will loop through all of the objects present in the questions array
  for (const each_ques of ques_array) {
    // before we can insert the question, if the count is "distribute" we first need to calculate the number
    if (each_ques.count == "distribute") {
      // do the calculation in an async function and get its result
      try {
        qcount = await get_distributed_value();
      } catch (err) {
        console.error("couldnt find distribute value, defaulting to 1");
        qcount = 1;
      }
    } else {
      qcount = each_ques.count;
    }
    ques_insert = `insert into Questions (ques_type_id, survey_id, title, info, ques_order_num, ques_count) values (${each_ques.type}, ${survey_id}, "${each_ques.title}", "${each_ques.info}", ${each_ques.qnum}, ${qcount});`;
    // wrap the query in try catch in case the promise is rejected
    try{
      ins_result = await db_call(ques_insert); 
    } catch (err) {
      console.error("Question insert query failed", ques_insert);
      res.redirect(`/adminhome/study/${req.params.study_id}/`);
    }
    // while we are dealing with this question we also need to insert the options for this question into the db
    // we run a query on and the unique ques_id of the question we just entered into the database
    ques_id_query = `select ques_id from Questions where survey_id = "${survey_id}" and ques_order_num = "${each_ques.qnum}";`;
    // wrap the query in try catch in case the promise is rejected
    try{
      ques_id = await db_call(ques_id_query);
      ques_id = ques_id[0].ques_id;
    } catch (err) {
      console.error("Question id query failed", ques_id_query);
      res.redirect(`/adminhome/study/${req.params.study_id}/`);
    }
    
    // and now we loop through all the options and check to see if any of them belong to the ques num of this ques
    for (const each_opt of options_array) {
      if ( each_opt.qnum == each_ques.qnum ) {
        // this option belongs to this question so we make the insert query for it
        opt_insert = `insert into Options (ques_id, label, text_associated) values (${ques_id}, "${each_opt.label}", ${each_opt.text_associated});`;
        try{
          ins_result = await db_call(opt_insert); 
        } catch (err) {
          console.error("Options insert query failed", ins_result, "for question", each_ques.qnum);
          res.redirect(`/adminhome/study/${req.params.study_id}/`);
        }
      }
    }
  }
  res.redirect(`/adminhome/study/${req.params.study_id}/`);
});

app.listen(PORT, () => {
  console.log(`Server running on port 3000`);
})

 /*
  * have app js take cli arguments for which ports to look for databases on
  * if survey creation fail at any part, send a request to the delete route to clean up any partial inserts
  * the get_distributed_values() function does not have any repetition overlap for files, need to add that
  
  * updae ui for login and register page maybe
  * test mutiple users with with different users havning completed different surveys
  * docker image
  * */
