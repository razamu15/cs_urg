/*
Main express app
*/
// no need to install and include body parser because it was added back into expresss core in verison 4.16 and we are on version 4.17
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path =  require('path');

// define databse connection object and connet to the mysql database
var dbconn = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'password',
    database:'ins'
});

/**
 * THERE ARE A COUPLE THINGS THAT  MIGHT NEEED TO MODIFFY AOBUT THE DB
 * 1. RIGHT NOW IF THERE IS A TEXT OPTION, THEN ACTUAL TEXT RESPONSE WIL GO INTO THE RESPONSE OPEN_RESP COLUMN
 *   I MIGHT WANT TO ADD A TEXT_ANS COLUMN IN THE OPTIONS TABLE ITSELF BECAUSE THEN YOU WONT HAVE TO LOOK UP THE OPTION TYPE, LOOK AT IF IT IS TEXT ASSOCIATED AND THEN GO BACK TO THE RESPONSES TABLE TO GET THE TEXT
 * 2. AT THIS POINT THERE IS NO OTHER WAY TO UNIQELY IDETIFY A SURVEY OTHER THAN ITS SURVEY_ID AND THATS BAD BECAUSE AS SOON AS I CREATE THE SURVEY I HAVE NO WAY OF KNOWING WHAT ITS ID FOR FOREIGN KEY CONTRAINTS
 *  I COULD MAKE STUDY ID AND THE TITLE UNIQUE TOGETHER, ORRR I EXPLICITLY CREATE A ID EVERY TIME I INSERT INTO THE DB(SEEMS BAD)
 */
  
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
app.use(express.static('static'));

app.get('/', (req, res) =>{
  res.render('pages/external_view');
})

app.get('/contact', (req, res) =>{
  res.render('pages/contact_view');
})

app.get('/adminhome', async (req, res) =>{
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


// for this route i will run the query that will get all the surveys for this study
// then use ejs to render in a thingy for each survey and build the link for each
// with the templating engine
app.get('/adminhome/study/:study_id', async (req, res) =>{
  // use the url parameter to get the all the surveys for the needed study
  try{
    query_result = await db_call(`select * from Surveys where study_id = ${req.params.study_id};`);
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  // query the database to get all the surveys that belong to the id req.params.study_id
  console.log(query_result);
  res.render("pages/study_view", {study_id : req.params.study_id});
});


app.get('/adminhome/study/:study_id/create_survey', async (req, res) => {
  // we shall wait untill we ge the result from the query
  try{
    query_result = await db_call("select * from Question_Types;");
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  res.render('pages/make_survey', { ques_types_query : query_result, study_id: req.params.study_id });
});


app.post('/adminhome/study/:study_id/create_survey', async (req, res) => {
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
  survey_insert = `insert into Surveys (study_id, title, info, expiry_date, is_published) values (${req.params.study_id}, "${survey_info.surv_title}", "${survey_info.surv_info}", NULL, 0);`;
  // wrap the query in try catch in case if promise is rejected
  try{
    ins_result = await db_call(survey_insert); 
  } catch (err) {
    console.log(survey_insert);
    res.send("insert query failed");
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
    console.log(survey_id_query);
    res.send("failed to get survey id");
  }

  // since there can be questions we will loop through all of the objects present in the questions array
  for (const each_ques of ques_array) {
    ques_insert = `insert into Questions (ques_type_id, survey_id, title, info, ques_order_num, ques_count) values (${each_ques.type}, ${survey_id}, "${each_ques.title}", "${each_ques.info}", ${each_ques.qnum}, ${each_ques.count});`;
    // wrap the query in try catch in case the promise is rejected
    try{
      ins_result = await db_call(ques_insert); 
    } catch (err) {
      console.log(ques_insert);
      res.send("Question insert failed for ques " + each_ques.qnum);
    }
    // while we are dealing with this question we also need to insert the options for this question into the db
    // we run a query on and the unique ques_id of the question we just entered into the database
    ques_id_query = `select ques_id from Questions where survey_id = "${survey_id}" and ques_order_num = "${each_ques.qnum}";`;
    // wrap the query in try catch in case the promise is rejected
    try{
      ques_id = await db_call(ques_id_query);
      ques_id = ques_id[0].ques_id;
    } catch (err) {
      console.log(ques_id_query);
      res.send("unable to get ques id for ques" + each_ques.qnum)
    }
    
    // and now we loop through all the options and check to see if any of them belong to the ques num of this ques
    for (const each_opt of options_array) {
      if ( each_opt.qnum == each_ques.qnum ) {
        // this option belongs to this question so we make the insert query for it
        opt_insert = `insert into Question_Options (ques_id, label, text_associated) values (${ques_id}, "${each_opt.label}", ${each_opt.text_associated});`;
        try{
          ins_result = await db_call(opt_insert); 
        } catch (err) {
          console.log(opt_insert);
          res.send("Question insert failed for ques " + each_ques.qnum);
        }
      }
    }
  }
  
  res.redirect("/adminhome/study/" + req.params.study_id);
});


// This is gonna be a simple page with some posts for updating this survey in the DB
app.get('/adminhome/study/:study_id/survey/:survey_id', async (req, res) =>{
  // run the db query and get all the data we need for this survey
  try{
    query_result = await db_call(`select * from Surveys where survey_id = ${req.params.survey_id};`);
  } catch (err){
    console.log("doesnt matter query works" + err);
    res.send("something went wrong");
  }
  console.log(query_result);
  res.render("pages/survey_view", {survey_info : query_result[0]});
});


app.get('/userhome', async (req, res) => {
  // userid is stored in session so we grab that
  user_id = 1
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
    questions = await db_call(questions_query);
    survey = await db_call(survey_query);
    qtypes= await db_call("select * from Question_Types;");
  } catch (err) {
    console.log(survey_stuff, "failed");
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




app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});

