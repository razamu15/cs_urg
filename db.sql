CREATE DATABASE dem;
USE dem;

CREATE TABLE `Users` (
	`user_id` INT NOT NULL AUTO_INCREMENT,
	`email`	VARCHAR(255) NOT NULL UNIQUE,
	`is_admin` BOOLEAN NOT NULL DEFAULT false,
	`utorid` VARCHAR(32) NOT NULL DEFAULT "",
	`student_number` INT NOT NULL DEFAULT 1,
	`password` VARCHAR(255) NOT NULL,
	`is_active`	BOOLEAN,
	`gender` VARCHAR(20),
	PRIMARY KEY(`user_id`)
);

CREATE TABLE `Reset_Pass` (
	`link_key` VARCHAR(255) NOT NULL,
	`email` VARCHAR(255) NOT NULL,
	`expiry` BIGINT NOT NULL,
	`time_stamp` DATETIME NOT NULL,
	FOREIGN KEY(`email`) REFERENCES `Users`(`email`),
	PRIMARY KEY(`link_key`)
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
	`is_round` BOOLEAN NOT NULL,
	FOREIGN KEY(`study_id`) 
	    REFERENCES `Studies`(`study_id`)
	    ON DELETE CASCADE,
	UNIQUE KEY (`study_id`,`title`),
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
	    REFERENCES `Surveys`(`survey_id`)
	    ON DELETE CASCADE,
	FOREIGN KEY(`ques_type_id`)
	    REFERENCES `Question_Types`(`ques_type_id`),
	UNIQUE KEY (`survey_id`,`ques_order_num`),
	PRIMARY KEY(`ques_id`)
);

CREATE TABLE `Options` (
	`op_id`	INT NOT NULL AUTO_INCREMENT,
	`ques_id`  INT NOT NULL,
	`label`	TEXT NOT NULL,
	`text_associated` BOOLEAN NOT NULL,
	PRIMARY KEY(`op_id`),
	FOREIGN KEY(`ques_id`)
	    REFERENCES `Questions`(`ques_id`)
	    ON DELETE CASCADE
);

CREATE TABLE `Responses` (
	`response_id` INT NOT NULL AUTO_INCREMENT,
	`ques_id`  INT NOT NULL,
	`file_id`  INT,
	`user_id`  INT NOT NULL,
	`op_id`	 INT,
	`op_text`  TEXT,
	`text_resp` TEXT,
	`time_started` DATETIME NOT NULL,
	`time_ended` DATETIME NOT NULL,
	FOREIGN KEY(`user_id`) REFERENCES `Users`(`user_id`),
	FOREIGN KEY(`op_id`) REFERENCES `Options`(`op_id`),
	FOREIGN KEY(`ques_id`) 
	    REFERENCES `Questions`(`ques_id`)
	    ON DELETE CASCADE,
	FOREIGN KEY(`file_id`) REFERENCES `Files`(`file_id`),
	UNIQUE KEY(`ques_id`,`file_id`,`user_id`, `op_id`),
	PRIMARY KEY(`response_id`)
);

CREATE TABLE `Completed_Surveys`(
	`user_id` INT NOT NULL,
	`survey_id`  INT NOT NULL,
	`completion_date` DATETIME,
	`is_round` BOOLEAN NOT NULL,
	FOREIGN KEY(`survey_id`)
	    REFERENCES `Surveys`(`survey_id`)
	    ON DELETE CASCADE,
	FOREIGN KEY(`user_id`)
	    REFERENCES `Users`(`user_id`),
	PRIMARY KEY(`user_id`, `survey_id`)
);

CREATE TABLE `Files_in_Use`(
	`file_id` INT NOT NULL,
	`ques_id` INT NOT NULL,
	`count` INT NOT NULL,
	FOREIGN KEY(`ques_id`)
	    REFERENCES `Questions`(`ques_id`)
	    ON DELETE CASCADE,
	FOREIGN KEY(`file_id`)
	    REFERENCES `Files`(`file_id`),
	PRIMARY KEY(`file_id`, `ques_id`)
);

insert into Question_Types (label, has_text, has_options, has_file) values ("classification", 0, 1, 1);
insert into Question_Types (label, has_text, has_options, has_file) values ("summary", 1, 0, 1);
insert into Question_Types (label, has_text, has_options, has_file) values ("open_response", 1, 0, 0);
insert into Question_Types (label, has_text, has_options, has_file) values ("rating", 0, 1, 0);