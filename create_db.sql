create database test_db;
use test_db;

CREATE TABLE `Users` (
	`user_id` INT NOT NULL AUTO_INCREMENT,
	`email`	VARCHAR(255) NOT NULL UNIQUE,
	`password` VARCHAR(255) NOT NULL,
	`is_active`	BOOLEAN,
	`gender` VARCHAR(20),
	PRIMARY KEY(`user_id`)
);

CREATE TABLE `Files` (
	`file_id` INT NOT NULL AUTO_INCREMENT,
	`link` VARCHAR(255) NOT NULL UNIQUE,
	`is_active` BOOLEAN NOT NULL,
	PRIMARY KEY(`file_id`)
);

CREATE TABLE `Studies` (
	`study_id`	INT NOT NULL AUTO_INCREMENT,
	`title`	VARCHAR(255) NOT NULL,
	`info`	TEXT NOT NULL,
	`is_active` BOOLEAN NOT NULL,
	PRIMARY KEY(`study_id`)
);

CREATE TABLE `Surveys` (
    `survey_id` INT NOT NULL AUTO_INCREMENT,
	`study_id` INT NOT NULL,
	`title` VARCHAR(255) NOT NULL,
	`info` TEXT NOT NULL,
	`expiry_date` DATE,
	`is_published` BOOLEAN NOT NULL,
	FOREIGN KEY(`study_id`) 
	    REFERENCES `Studies`(`study_id`),
	PRIMARY KEY(`survey_id`) 
);

CREATE TABLE `Question_Types` (
	`ques_type_id` INT NOT NULL AUTO_INCREMENT,
	`label` VARCHAR(255) NOT NULL,
	`has_text` BOOLEAN NOT NULL,
	`has_options` BOOLEAN NOT NULL,
	`has_file` BOOLEAN NOT NULL,
	PRIMARY KEY(`ques_type_id`)
);

CREATE TABLE `Questions` (
	`ques_id`  INT NOT NULL AUTO_INCREMENT,
	`ques_type_id` INT NOT NULL,
	`survey_id`	INT NOT NULL,
	`title` TEXT NOT NULL,
	`info`  TEXT,
	`ques_order_num` INT NOT NULL,
	`ques_count`  INT NOT NULL,
	FOREIGN KEY(`survey_id`)
	    REFERENCES `Surveys`(`survey_id`),
	FOREIGN KEY(`ques_type_id`)
	    REFERENCES `Question_Types`(`ques_type_id`),
	UNIQUE KEY (`survey_id`,`ques_order_num`),
	PRIMARY KEY(`ques_id`)
);

CREATE TABLE `Question_Options` (
	`op_id`	INT NOT NULL AUTO_INCREMENT,
	`ques_id`  INT NOT NULL,
	`label`	TEXT NOT NULL,
	`text_associated` BOOLEAN NOT NULL,
	PRIMARY KEY(`op_id`),
	FOREIGN KEY(`ques_id`)
	    REFERENCES `Questions`(`ques_id`)
);

CREATE TABLE `Responses` (
	`response_id` INT NOT NULL AUTO_INCREMENT,
	`ques_id`  INT NOT NULL,
	`file_id`  INT,
	`user_id`  INT NOT NULL,
	`op_id`	 INT,
	`text_resp` TEXT,
	`time_started` DATETIME NOT NULL,
	`time_ended` DATETIME NOT NULL,
	FOREIGN KEY(`user_id`)
	    REFERENCES `Users`(`user_id`),
	FOREIGN KEY(`op_id`)
	    REFERENCES `Question_Options`(`op_id`),
	FOREIGN KEY(`ques_id`)
	    REFERENCES `Questions`(`ques_id`),
	FOREIGN KEY(`file_id`)
	    REFERENCES `Files`(`file_id`),
	UNIQUE KEY(`ques_id`,`file_id`,`user_id`, `op_id`),
	PRIMARY KEY(`response_id`)
);

CREATE TABLE `Completed_Surveys`(
	`user_id` INT NOT NULL,
	`survey_id`  INT NOT NULL,
	`completion_date` DATETIME,
	FOREIGN KEY(`survey_id`)
	    REFERENCES `Surveys`(`survey_id`),
	FOREIGN KEY(`user_id`)
	    REFERENCES `Users`(`user_id`),
	PRIMARY KEY(`user_id`, `survey_id`)
);

insert into Studies (title, info, is_active)values("tools", "this study is to simulate the tools study were gonna do", 1);
insert into Surveys (study_id, title, info, expiry_date, is_published) values (1, "survey 1", "this will be the round 1 classification", '2019-08-29', 1);

insert into Question_Types (label, has_text, has_options, has_file) values ("classification", 0, 1, 1);
insert into Question_Types (label, has_text, has_options, has_file) values ("summary", 1, 0, 1);
insert into Question_Types (label, has_text, has_options, has_file) values ("open_response", 1, 0, 0);
insert into Question_Types (label, has_text, has_options, has_file) values ("rating", 0, 1, 0);

insert into Questions (ques_type_id, survey_id, title, info, ques_order_num, ques_count) values (1, 1, "determining paper relevance", "simple rel or irr", 1, 5);
insert into Questions (ques_type_id, survey_id, title, info, ques_order_num, ques_count) values (3, 1, "how do feels bout extra curriculars?", "one to two sentences", 2, 1);

insert into Question_Options (ques_id, label, text_associated) values (1, "Relevant", 0);
insert into Question_Options (ques_id, label, text_associated) values (2, "Irrelevant", 0);
insert into Question_Options (ques_id, label, text_associated) values (3, "Other", 1);

insert into Files (link, is_active) values ("/link_to_file1", 1);
insert into Files (link, is_active) values ("/link_to_file2", 1);
insert into Files (link, is_active) values ("/link_to_file3", 1);
insert into Files (link, is_active) values ("/link_to_file4", 1);
insert into Files (link, is_active) values ("/link_to_file5", 1);

insert into Users (email, password, is_active, gender) values ("user1@outlook.com", "user1pass", 1, "m");
insert into Users (email, password, is_active, gender) values ("user2@outlook.com", "user2pass", 1, "f");
insert into Users (email, password, is_active, gender) values ("user3@gmail.com", "user3pass", 1, "x");
insert into Users (email, password, is_active, gender) values ("user4@live.com", "user4pass", 1, "f");

insert into Responses values (1, 1, 1, 1, 1, null, curdate(), curdate());
insert into Responses values (2, 1, 2, 1, 1, null, curdate(), '2019-08-16 22:39:00');
insert into Responses values (3, 1, 3, 1, 2, null, curdate(), '2019-08-16 22:39:50');
insert into Responses values (4, 1, 4, 1, 3, 'its not exactly about a tool, but talks about a tool effect in a way', curdate(), '2019-08-16 22:39:50');
insert into Responses values (5, 1, 5, 1, 2, null, curdate(), '2019-08-16 22:41:37');
insert into Responses values (6, 2, null, 1, null, "i like it but its too much work, tbh", curdate(), '2019-08-16 23:04:37');


insert into Responses values (7, 1, 1, 2, 1, null, curdate(), curdate());
insert into Responses values (8, 1, 2, 2, 2, null, curdate(), '2019-08-16 23:29:10');
insert into Responses values (9, 1, 3, 2, 2, null, curdate(), '2019-08-16 23:39:50');
insert into Responses values (10, 1, 4, 2, 3, 'yes', curdate(), '2019-08-16 23:44:58');
insert into Responses values (11, 1, 5, 2, 1, null, curdate(), '2019-08-16 23:45:37');
insert into Responses values (12, 2, null, 2, null, "i hate it, imma quit", curdate(), '2019-08-16 23:54:37');

insert into Completed_Surveys values (1, 1, curdate());
insert into Completed_Surveys values (2, 1, '2019-08-16 23:59:59' );