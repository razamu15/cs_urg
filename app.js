const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const redis = require('redis');
const session = require('express-session');
const redisStore = require('connect-redis')(session);

// define databse connection object and connet to the mysql database
var dbconn = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'password',
    database:'ins'
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


app.get('/', (req, res) =>{
  res.render('pages/external_view');
})

app.get('/login', (req, res) => {
  // check if this session has a user_id which means it has already been authenticated
  if (req.session.user_id) {
    // redirect them to home, cz you cant login twice
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

app.get('/contact', (req, res) =>{
  if (req.session.user_id) {
    res.render('pages/contact_view', {action: "logout"});
  } else {
    res.render('pages/contact_view', {action: "login"});
  }
})

app.get('/userhome', async (req, res) => {
  // this page is not accessible if not signed in
  if (!req.session.user_id) {
    res.redirect('/login');
    return;
  } else {
    user_id = req.session.user_id;
  }
  // first we gott run the query for all the surveys that are active ie(publised and not expired)
  survey_query = `select * from Surveys where survey_id not in (select survey_id from Completed_Surveys where user_id = ${user_id}) and expiry_date > curdate() and is_published = 1;`;
  try{
    active_surveys = await db_call(survey_query);
  } catch (err) {
    console.log(survey_query, "failed");
  }
  // finally we render the template with any surveys that have not yet been answered by this user
  res.render('pages/user_home', { available_surveys: active_surveys})
})

app.get('/userhome/survey/:survey_id', async (req, res) =>{
  // natural join the survey with the questions with the question options then order by ques_id then op_id
  questions_query = ` select all_ques.ques_id, ques_type_id, ques_order_num, ques_count, title, info, op_id, label, text_associated from (select Questions.survey_id, ques_id, ques_type_id, ques_count, ques_order_num, Questions.title, Questions.info from Surveys inner join Questions on Surveys.survey_id = Questions.survey_id) as all_ques left join Question_Options on Question_Options.ques_id = all_ques.ques_id where survey_id = ${req.params.survey_id} order by all_ques.ques_order_num, op_id;`;
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
  res.render('pages/complete_survey', {survey: survey_results, questions:ques_array, qtypes: qtypes_json});
})

app.post('/userhome/survey/:survey_id', (req, res) =>{
  console.log(req.body);
  res.send("thx for completing the survey my dawgy");
})

app.get('/getfile/ques/:ques_id', async (req, res) =>{
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

app.listen(3000, () => {
  console.log(`Server running on port 3000`);
});

app.get('/adminhome', async (req, res) =>{
  // this page is not accessible if not signed in
  if (!req.session.user_id) {
    res.redirect('/login');
    return;
  }
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Studies;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  // here we will list all the studies that are active and use the query to render in the html properly
  res.render("pages/admin_home", { query_result:query_result });
})


/**
 * THERE ARE A COUPLE THINGS THAT  MIGHT NEEED TO MODIFFY AOBUT THE DB
 * 1. RIGHT NOW IF THERE IS A TEXT OPTION, THEN ACTUAL TEXT RESPONSE WIL GO INTO THE RESPONSE OPEN_RESP COLUMN
 *   I MIGHT WANT TO ADD A TEXT_ANS COLUMN IN THE OPTIONS TABLE ITSELF BECAUSE THEN YOU WONT HAVE TO LOOK UP THE OPTION TYPE, LOOK AT IF IT IS TEXT ASSOCIATED AND THEN GO BACK TO THE RESPONSES TABLE TO GET THE TEXT
 * 2. AT THIS POINT THERE IS NO OTHER WAY TO UNIQELY IDETIFY A SURVEY OTHER THAN ITS SURVEY_ID AND THATS BAD BECAUSE AS SOON AS I CREATE THE SURVEY I HAVE NO WAY OF KNOWING WHAT ITS ID FOR FOREIGN KEY CONTRAINTS
 *  I COULD MAKE STUDY ID AND THE TITLE UNIQUE TOGETHER, ORRR I EXPLICITLY CREATE A ID EVERY TIME I INSERT INTO THE DB(SEEMS BAD)
 */
