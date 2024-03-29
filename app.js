const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const redis = require('redis');
const session = require('express-session');
const redisStore = require('connect-redis')(session);
const got = require('got');
const bcrypt = require('bcrypt');
const exec = require('child_process').exec;

// configurations for all the different things going on in this app
const config = require('./config');
var SKIP_DELETE_AUTH;

// define databse connection pool object
var conn_pool = mysql.createPool({
    connectionLimit: config.MYSQL_POOL_SIZE,
    host: config.MYSQL_HOST,
    user: config.MYSQL_USER,
    port: config.MYSQL_PORT,
    password: config.MYSQL_PASS,
    database: config.MYSQL_DB
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
    host: config.REDIS_HOST, 
    port: config.REDIS_PORT,
    client: redisClient,
    ttl: config.SESSION_TTL
  }),
  secret: "ahhheeeeahlieseeendawger",
  saveUninitialized: false,
  resave: false
}));


// function that will return a promise you can call await on to wait
// untill the database query is resolved so you can then work with the data
function db_call(query_str){
  return new Promise( (resolve, reject) => {
    // execute a sql query to show all users
    conn_pool.query(query_str, function (err, result) {
    // if query failed then reject promise otherwise resolve with the data
    if (err) {
      reject("query failed");
    } else {
      resolve(result)
    }
    })
  })
};

// this function calculates the ques_count if we want to distribute the files evenly between all users.
async function get_distributed_value() {
  // get the active file count and the active user count
  file_count = await db_call("select COUNT(*) from Files where is_active = 1;");
  user_count = await db_call("select COUNT(*) from Users where is_active = 1;");
  file_count = file_count[0]['COUNT(*)'];
  user_count = user_count[0]['COUNT(*)'];
  result = Math.ceil((file_count * config.DIST_OVERLAP)/(user_count - 1));
  // we wanna make sure we dont return infinity or zero as a our ques_count
  if (result == 0 || !isFinite(result)) {
    return 1;
  } else {
    return result; 
  }
}

// ###########################################################################
// ---------------------------------------------------------------------------
// ##################### APPLICATION ROUTES AND LOGIC ########################
// ---------------------------------------------------------------------------
// ###########################################################################


app.get('/', (req, res) => {
  // check if the user is laready logged in
  if (!req.session.hasOwnProperty("is_admin")) {
    res.render('pages/external_view');
  } else if (req.session.is_admin) {
    res.redirect('/adminhome');
  } else {
    res.redirect('/userhome');  
  }
})

app.get('/login', (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    // show them the login page
    res.render('pages/login', {message: "Please enter your email and password"});
  } else if (req.session.is_admin) {
    res.redirect('/adminhome');
  } else {
    res.redirect('/userhome');  
  }
})

// what the session middleware essentially does is it automatically stores any session 
// that was changed or had data added to it in redis, and whenecer you try to access a session
// it looks for it in redis and if its there gives you back the modified session ow it gives
// the browser default session which would be an unauthorized user
app.post('/login', async (req, res) => {
  const user_query = `select * from Users where email = "${req.body.email}";`;
  var user_result;
  // first we run the query on the database to get the relevant information for this user
  try {
    user_result = await db_call(user_query);
    // check if the email was correct so that we actually found a matching row in the db
    if (user_result.length == 0) {
      res.render('pages/login', {message: "Incorrect email"});
      return;
    } else {
      user_result = user_result[0];
    }
  } catch (error) {
    console.log("Query to verify login failed", user_query);
    res.render('pages/login', {message: "Something went wrong, Please try again later"});
    return;
  }
  
  // we then check if the credentials are correct and if they are, we will create a session for them
  if(bcrypt.compareSync(req.body.password, user_result.password)) {
    // Passwords match add their info to session which will automatically be stored in redis
    req.session['user_id'] = user_result.user_id;
    req.session['is_admin'] = user_result.is_admin;
    req.session['email'] = user_result.email;
    // now we direct them to the dashboard
    res.redirect(`/${ req.session['is_admin'] ? "adminhome" : "userhome" }`);
   } else {
    // Passwords don't match we render login page again but give a error message saying wrong password
    res.render('pages/login', {message: "Incorrect password"});
  }
})

app.get('/req_reset', (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.render('pages/request_reset', {message:""});
  } else if (req.session.is_admin) {
    res.redirect('/adminhome');
  } else {
    res.redirect('/userhome');  
  }
})

app.post('/req_reset', async (req, res) => {
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
  } else {
      // check if this is a valid email
      const email = req.body.email;
      const valid_query = `select * from Users where email = "${email}";`;
      var validity;
      try {
        validity = await db_call(valid_query);
        // check if the email was correct so that we actually found a matching row in the db
        if (validity.length == 0) {
          res.render('pages/request_reset', {message: "Invalid email address"});
          return;
        }
      } catch (error) {
        console.log("Query to validate reset email failed", valid_query);
        res.render('pages/request_reset', {message: "Something went wrong. Please check email and try again or report if problem persists"});
        return;
      }
      
      const time_stamp = String(Date.now());
      // we create a hash from the email form feild and time stamp
      let link_key = bcrypt.hashSync(time_stamp + email + time_stamp, config.HASH_COUNT);
      link_key = link_key.replace(/[/]+/g, '');
      // insert the hash and the email pair into the reset passwords sql table
      const insert_hash = `insert into Reset_Pass values ("${link_key}", "${email}", "${Date.now() + (config.RESET_LINK_TTL * 60000)}", now());`;
      try {
        let reset_req = await db_call(insert_hash);
      } catch (error) {
        console.log("Query to insert reset email hash failed", insert_hash);
        res.render('pages/request_reset', {message: "Something went wrong. Please try again or report if problem persists"});
        return;
      }
      // send email with the hash link and re render the same page but with message for success or failure for sending email
      let reset_link = `https://${config.SERVER_URL}/resetpass/${link_key}`;
      let email_com = exec(`echo 'Follow the link to reset your password:${reset_link}' | mail -s "CS URG Reset Password" ${email}`);
      email_com.on('exit', function (code) {
        if (code != 0) {
          res.render('pages/request_reset', {message: "Something went wrong in sending email. Please try again or report if problem persists"});
        } else {
          res.render('pages/request_reset', {message: "Success! Check your email"});
        }
        return;
      });
  }
  
})

app.get('/resetpass/:reset_hash', async (req, res) => {
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
  } else {
    // lookup the hash given as the parameter in our database
    const hash_query = `select * from Reset_Pass where link_key = "${req.params.reset_hash}";`;
    let invalid = true;
    let msg = "";
    var hash_validity;
    try {
      hash_validity = await db_call(hash_query);
    } catch (error) {
      console.log("Query to validate reset hash failed", hash_query);
      msg = "something went wrong, please report the problem";
    }
    // check get the time limit from the query 
    if (hash_validity.length == 0) {
      invalid = true;
      msg = "Password reset link is invalid";
    } else {
      if (Date.now() <= hash_validity[0].expiry) {
        invalid = false;
        msg = "please enter your new password";
      } else {
        msg = "Password rest link has expired";
      }
    }
    // render the reset_password page
    res.render('pages/reset_password', {invalid: invalid, message:msg});
  }
})

app.post('/resetpass/:reset_hash', async (req, res) => {
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
  } else {
      // lookup the hash given as the parameter in our database
      const hash_query = `select * from Reset_Pass where link_key = "${req.params.reset_hash}";`;
      var hash_row;
      try {
        hash_row = await db_call(hash_query);
        if (hash_row.length == 0) {
          console.log("Reset Hash doesnt exist", hash_query);
          res.render('pages/reset_password', {invalid: true, message:"invalid password reset link"});
          return;
        } else {
          hash_row = hash_row[0];
        }
      } catch (error) {
        console.log("Query to get reset hash failed", hash_query);
        res.render('pages/reset_password', {invalid: true, message:"something went wrong, please report the problem"});
        return;
      }
      // get the email from the query and combine it with the new password to make update_password sql
      let pass = bcrypt.hashSync(req.body.pass, config.HASH_COUNT);
      const update_pass_sql = `update Users set password = "${pass}" where email = "${hash_row.email}";`;
      // run the query
      try {
        let upd_pass = await db_call(update_pass_sql);
      } catch (error) {
        console.log("Query to update password failed", update_pass_sql);
        res.render('pages/reset_password', {invalid: true, message:"something went wrong in applying new password, please report the problem"});
        return;
      }
      // everything was gucci, so return the user to the login page
      res.redirect('/login');
  }
})

app.get('/logout', (req, res) =>{
  if (req.session.hasOwnProperty("is_admin")) {
    req.session.destroy();
  } 
  res.redirect('/');
})

app.get('/register', (req, res) => {
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
  } else {
    res.render('pages/register', {message: "Please enter an email and password to register", path_to_text: config.CONSENT_TEXT});
  }
})

app.post('/register', async (req, res) => {
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
  } else {
    // define the query and fill it with the information from the post request
    let pass = bcrypt.hashSync(req.body.password, config.HASH_COUNT);
    const insert_query = `insert into Users (email, utorid, is_admin, student_number, password, is_active, gender) values ("${req.body.email}", "${req.body.utorid}", false ,"${req.body.studentnum}", "${pass}", 1, "${req.body.gender}");`;
    // we run the query on the databse but if there is a unique email violation then the function will throw an error
    try{
      var result = await db_call(insert_query);
    } catch (err) {
      console.log("insert user query failed, because duplicate email.", insert_query);
      res.render('pages/register', {message: "Unable to create user, email already in use", path_to_text: config.CONSENT_TEXT});
      return;
    }
    // if the query is ok then the user was creted and we redirect hem to the login page
    res.redirect('/login');
  }
})

app.get('/contact', (req, res) =>{
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.render('pages/contact_view', {action: "logout", home:"adminhome"}); 
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.render('pages/contact_view', {action: "logout", home:"userhome"});
  } else {
    res.render('pages/contact_view', {action: "login", home:""});
  }
})

app.get('/userhome', async (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
  } else if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
  } else {
    // first we gott run the query for all the surveys that are active ie(publised and not expired)
    const survey_query = `select * from Surveys where survey_id not in (select survey_id from Completed_Surveys where user_id = "${req.session.user_id}" and is_round = 0) and expiry_date > curdate() and is_published = 1;`;
    var active_surveys;
    try{
      active_surveys = await db_call(survey_query);
    } catch (err) {
      console.log("Query to get active surveys for user failed", survey_query);
    }
    // finally we render the template with any surveys that have not yet been answered by this user
    res.render('pages/user_home', { available_surveys: active_surveys});
  }
})

app.get('/userhome/survey/:survey_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.redirect('/adminhome');
    return;
  }
  // natural join the survey with the questions with the question options then order by ques_id then op_id
  const questions_query = ` select all_ques.ques_id, ques_type_id, ques_order_num, ques_count, title, info, op_id, label, text_associated from (select Questions.survey_id, ques_id, ques_type_id, ques_count, ques_order_num, Questions.title, Questions.info from Surveys inner join Questions on Surveys.survey_id = Questions.survey_id) as all_ques left join Options on Options.ques_id = all_ques.ques_id where survey_id = ${req.params.survey_id} order by all_ques.ques_order_num, op_id;`;
  const survey_query = `select * from Surveys where survey_id = ${req.params.survey_id}`;
  var questions, survey, qtypes;
  
  try{
    // execute all three queries on the database
    questions = await db_call(questions_query);
    survey = await db_call(survey_query);
    qtypes= await db_call("select * from Question_Types;");
  } catch (err) {
    console.log(survey_query, "failed");
    console.log("or", qtypes_query, "failed");
    res.redirect('/userhome');
    return;
  }
  
  // now that we have the data that we need from the databse, we will format and categorize it into arrays and objects 
  // so that its easier to render on the webpage
  let qtypes_json = {}
  for (const row of qtypes) {
    qtype_obj = {...row};
    qtypes_json[row.ques_type_id] = qtype_obj;
  }
  // now we deal with the survey data
  let survey_results = survey[0];
  ques_array = [];
  var qnum, ques_obj;
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
      let ques_opt_array = ques_array[qnum].options;
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
  if (!req.session.hasOwnProperty("is_admin")){
    res.sendStatus(401);  // not logged in at all unauthrozed to post
  } else if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.sendStatus(403);  // logged in as admin cant do user actions
  } else {
    let file_fill = req.body.file_id;
    let text = req.body.text;
    let opt_id = req.body.opt;
    let opt_text = req.body.opt_text;
    // define and fill in the response insert query
    let insert_query = `insert into Responses (ques_id, file_id, user_id, op_id, op_text, text_resp, time_started, time_ended) values (${req.body.ques_id}, ${file_fill ? file_fill : "NULL"}, ${req.session.user_id}, ${opt_id ? opt_id : "NULL"}, "${opt_text ? opt_text : "NULL"}", "${text ? text : "NULL"}", "${req.body.start_time}", "${req.body.end_time}");`;

    // execute it on the database
    try {
      ins_result = await db_call(insert_query);
      res.sendStatus(200);
    } catch (err) {
      console.log("failed to insert response in the db", insert_query);
      res.sendStatus(501);
    } 
  }
})

app.post('/userhome/completed/:survey_type/:survey_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")){
    res.sendStatus(401);  // not logged in at all unauthrozed to post
  } else if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.sendStatus(403);  // logged in as admin cant do user actions
  } else {
    // we difine and run the query that will mark this survey as completed for this user
    let finish_query = `insert into Completed_Surveys (user_id, survey_id, completion_date, is_round) values (${req.session.user_id}, ${req.params.survey_id}, now(), ${req.params.survey_type == "survey" ? 0 : 1});`;
    try {
      result = await db_call(finish_query);
      res.sendStatus(200);
    } catch (error) {
      console.log("query to mark survey completed, failed", finish_query);
      res.sendStatus(501);
    }
  }
})

app.get('/getfile/ques/:ques_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")){
    res.sendStatus(401);  // not logged in at all unauthrozed to post
  } else if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    res.sendStatus(403);  // logged in as admin cant do user actions
  } else {
    let fresh_files_query = `select * from Files where Files.file_id not in (select file_id from Files_in_Use where ques_id = ${req.params.ques_id}) and is_active = 1;`;
    try {
      fresh_files = await db_call(fresh_files_query);
    } catch (error) {
      console.log("error in fresh query:", fresh_files_query);
      // the file was not marked inactive, something went wrong
      res.sendStatus(501);
      return;
    }
    var rand_int, selected_row;
    // we now check if there were any rows returned and if there werent, then we do the next query
    if (fresh_files.length != 0) {
      // this means there were files in the original table
      rand_int = Math.floor(Math.random() * (fresh_files.length - 1 - 0 + 1) + 0);
      selected_row = fresh_files[rand_int];
      // we have our row and file that we will send back, update its count in the database and return it
      let update_count = `insert into Files_in_Use (file_id, ques_id, count) values (${selected_row.file_id},${req.params.ques_id}, 1);`
      try {
        ins_result = await db_call(update_count);
        // return with the query data
        res.json(selected_row);
        return;
      } catch (error) {
        console.log("error in insert query");
        // the file was not marked inactive, something went wrong
        res.sendStatus(501);
        return;
      }
    } else {
      // if the fresh files query did result in 0 rows then all files have been sent out at least once, so we need to get the
      // files id from the Files_in_Use table
      let query = `select * from (select * from Files_in_Use where count = (select MIN(count) from Files_in_Use) and file_id not in (select file_id from Responses where user_id = ${req.session.user_id} and ques_id = ${req.params.ques_id})) as possibles inner join Files on possibles.file_id = Files.file_id;`;
      try {
        files = await db_call(query);
      } catch (error) {
        console.log("error in used files query:", query);
        // the file was not marked inactive, something went wrong
        res.sendStatus(501);
        return;
      }
      // if the used files also return no results, then there are no more files to serve
      if (files.length == 0) {
        res.sendStatus(422);
        return;
      }
      // after getting the files, we randomly pick one row from the results
      rand_int = Math.floor(Math.random() * (files.length - 1 - 0 + 1) + 0);
      selected_row = files[rand_int];
      // we have our row and file that we will send back, update its count in the database and return it
      let update_count = `update Files_in_Use set count = ${ +selected_row.count + 1} where file_id = ${selected_row.file_id} and ques_id = ${req.params.ques_id};`;
      try {
        upd_result = await db_call(update_count);
        // return with the query data
        res.json(selected_row);
        return;
      } catch (error) {
        console.log("error in update query:", update_count);
        // the file was not marked inactive, something went wrong
        res.sendStatus(501);
        return;
      }
    }
  }
  // // check session
  // if (!req.session.user_id) {
  //   res.sendStatus(401);
  //   return;
  // } else if (req.session.user_id == "admin") {
  //   res.sendStatus(403);
  //   return;
  // } else if (req.session.email == "userview") {
  //   res.sendStatus(200);
  //   return;
  // }
  // first we run the query to get any files that have not been used at all for this question
})

app.get('/adminhome', async (req, res) =>{
  if (req.session.hasOwnProperty("is_admin") && req.session.is_admin) {
    // we shall wait untill we ge the result from the query
    try{
      query_result = await db_call("select * from Studies;");
    } catch (err){
      // something is very badly wrong because we cant even display the home page, so we signout the user and show that a msg
      console.log("query to get all studies failed", err);
      req.session.destroy();
      res.redirect('/');
    }
    // here we will list all the studies that are active and use the query to render in the html properly
    res.render("pages/admin_home", { studies:query_result });
  } else {
    res.redirect('/');
  } 
  return;
})

app.get('/adminhome/study/:study_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // use the url parameter to get the all the surveys for the needed study
    var query_result;
    try{
      query_result = await db_call(`select * from Surveys where study_id = ${req.params.study_id};`);
    } catch (err){
      console.log("query to get all surveys for a study failed", err);
      res.redirect("/adminhome");
    }
    res.render("pages/study_view", {study_id : req.params.study_id, surveys: query_result});
  }
})

app.post('/adminhome/create_study', async (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // take the info from the request body, and put it in the sql query
    let study_query = `insert into Studies (title, info, is_active) values ("${req.body.title}", "${req.body.info}", 1);`;
    // execute the sql query
    try {
      ins_result = await db_call(study_query);
    } catch (err) {
      console.log("failed to create new study", study_query);
    }
    res.redirect('/adminhome');
  }
})

app.get('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // run the db query and get all the data we need for this survey
    try{
      query_result = await db_call(`select * from Surveys where survey_id = ${req.params.survey_id};`);
    } catch (err){
      console.log("query to get details for a survey failed" + err);
      res.redirect(`/adminhome/study/${req.params.study_id}`);
    }
    res.render("pages/survey_view", {survey_info : query_result[0], study_id: req.params.study_id, survey_id:req.params.survey_id});
  }
})

app.post('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // i need to check if the 2 items from the request body are empty or not and build the query accordingly
    let pub_update = (req.body.is_published != "");
    let exp_update = (req.body.expiry_date != "");
    if (pub_update && exp_update) {
      update_query = `update Surveys set is_published = "${req.body.is_published}", expiry_date = "${req.body.expiry_date}" where survey_id = ${req.params.survey_id}`;
    } else {
      update_query = `update Surveys set ${ pub_update ? "is_published = '" + req.body.is_published + "'" : "expiry_date = '" + req.body.expiry_date + "'"} where survey_id = ${req.params.survey_id};`;
    }
    // execute the db query to update the db
    try{
      result = await db_call(update_query);
    } catch (err) {
      console.log(update_query, "failed");
    }
    res.redirect(`/adminhome/study/${req.params.study_id}/survey/${req.params.survey_id}`);
  }
})

app.post('/reset/survey/:survey_id', async (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // now i delete all the answers that belong to any question in this survey
    let answers_rem = `delete from Responses where ques_id in (select ques_id from Questions where survey_id = ${req.params.survey_id});`;
    // also delete records of any files that were used by questions in this survey
    let files_rem = `delete from Files_in_Use where ques_id in (select ques_id from Questions where survey_id = ${req.params.survey_id});`; 
    // also delete any records for people that have already completed this survey
    let completes_rem = `delete from Completed_Surveys where survey_id = ${req.params.survey_id};`;
    try {
      // if the queries succeeded, then we send a success status code ow we send a fail status code
      result = await Promise.all([db_call(answers_rem), db_call(files_rem), db_call(completes_rem)]);
      res.sendStatus(200);
    } catch (err) {
      console.log("survey reset failed");
      res.sendStatus(501);
    }
  }
})

app.post('/delete/survey/:survey_id', async (req, res) => {
  // we will check the variable that will tell us if we wanna check the admin authorization or not.
  // this is so that we can execute this route internally with out needed session authorization
  if (!SKIP_DELETE_AUTH) {
    if (!req.session.hasOwnProperty("is_admin") || !req.session.is_admin) {
      res.redirect('/login');
      return;
    }
  }
  // reset the variable that will skip authentication for this route
  SKIP_DELETE_AUTH = 0;

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
    console.log("Failed to remove the survey properly");
    if ( fail_counter == 0 ) {
      console.log(option_rem, "failed");
    } else if (fail_counter == 1) {
      console.log(ques_rem, "failed");
    } else {
      console.log(surv_rem, "failed");
    }
    res.sendStatus(501);
  }
});

app.get('/adminhome/study/:study_id/create/:survey_type', async (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
    return;
  } else {
    // we shall wait untill we ge the result from the query
    try{
      var query;
      if (req.params.survey_type == "survey"){
        query = "select * from Question_Types;";
      } else {
        query = "select * from Question_Types where has_file = 1;";
      }
      query_result = await db_call(query);
    } catch (err){
      console.log("question Types query failed" + err);
      res.redirect(`/adminhome/study/${req.params.study_id}/`);
      return;
    }
    res.render(`pages/make_${req.params.survey_type == "survey" ? "survey" : "round"}`, { ques_types_query : query_result, study_id: req.params.study_id });
  }
});

app.post('/adminhome/study/:study_id/create_survey', async (req, res) => {
  if (!req.session.hasOwnProperty("is_admin")) {
    res.redirect('/login');
    return;
  } else if (req.session.hasOwnProperty("is_admin") && !req.session.is_admin) {
    res.redirect('/userhome');
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
      op_data = data_key.split("_");
      ques_num = +op_data[0];
      op_info["qnum"] = ques_num;
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
      ques_data = data_key.split("_");
      ques_num = +ques_data[0];
      data_label = ques_data[1];
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
    survey_id = ins_result.insertId;
  } catch (err) {
    console.log("Survey creation query failed", survey_insert);
    res.redirect(`/adminhome/study/${req.params.study_id}/`);
    return;
  }
  // since there can be questions we will loop through all of the objects present in the ques-tions array
  for (const each_ques of ques_array) {
    // before we can insert the question, if the count is "distribute" we first need to calculate the number
    if (each_ques.count == "distribute") {
      // do the calculation in an async function and get its result
      try {
        qcount = await get_distributed_value();
      } catch (err) {
        console.log("couldnt find distribute value, defaulting to 1");
        qcount = 1;
      }
    } else {
      if ( isNaN(each_ques.count) || each_ques.count == "" ){
        qcount = "1";
      } else {
        qcount = each_ques.count;
      };
    }
    ques_insert = `insert into Questions (ques_type_id, survey_id, title, info, ques_order_num, ques_count) values (${each_ques.type}, ${survey_id}, "${each_ques.title}", "${each_ques.info}", ${each_ques.qnum}, ${qcount});`;
    // wrap the query in try catch in case the promise is rejected
    try{
      ins_result = await db_call(ques_insert);
      ques_id = ins_result.insertId;
    } catch (err) {
      console.log("Question insert query failed", ques_insert);
      // we toggle a variable that will let us do a post request on the delete route without having the properly authorized 
      // session, because the delete route will skip authentication for a request when this boolean is true
      SKIP_DELETE_AUTH = 1;
      got_promise = await got.post(`http://localhost:${config.PORT}/delete/survey/${survey_id}`).then(response => {
        console.log("question creation in survey failed, but clean up was succesfull");
      }).catch(error => {
        console.log("survey creation failed and following clean up also failed", error);
      });
      res.redirect(`/adminhome/study/${req.params.study_id}/`);
      return;
    }
    
    // and now we loop through all the options and check to see if any of them belong to the ques num of this ques
    for (const each_opt of options_array) {
      if ( each_opt.qnum == each_ques.qnum ) {
        // this option belongs to this question so we make the insert query for it
        opt_insert = `insert into Options (ques_id, label, text_associated) values (${ques_id}, "${each_opt.label}", ${each_opt.text_associated});`;
        try{
          ins_result = await db_call(opt_insert); 
        } catch (err) {
          console.log("Options insert query failed", ins_result, "for question", each_ques.qnum);
          // toggle the skip auth variable for internal reequests
          SKIP_DELETE_AUTH = 1;
          got_promise = await got.post(`http://localhost:${config.PORT}/delete/survey/${survey_id}`).then(response => {
            console.log("option creation failed, but clean up for whole survey was succesfull");
          }).catch(error => {
            console.log("survey creation failed and following clean up also failed", error);
          });
          res.redirect(`/adminhome/study/${req.params.study_id}/`);
          return;
        }
      }
    }
  }
  res.redirect(`/adminhome/study/${req.params.study_id}/`);
});


app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
})

 /*
  * an interface to manage users, deactivate and delete them
  
  * have a sql things that runs every so often and cleans up any file that had their count increased but no response recorded
    query will have to be something along the lines of reset file count to the number of rows that file is there for the corres
    ponding question. THIS can only be done when no one is logged in. 
  * 
  * right now file requesting works properly but useres will not be able to get more files untill all files have been given out
  *   to the same count. If a user requests a file but they have already answered for all the files that have the lowest current 
  *   count then they will not be given any more files even if they can complete questions for files of the second lowest count.
  * 
  * transactions for creating surveys
  * */
