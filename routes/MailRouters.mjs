import express from 'express';
import {SendOTP} from '../Controllers/MailController.mjs'
import { ChangePassword } from "../Controllers/MailController.mjs";
const MailRouter = express.Router();



//Link :@post /Mail/ContactUs/
//Body : {Email: "Email"}
MailRouter.route("/SendOTP/").post(SendOTP);
MailRouter.route("/ChangePassword/").post(ChangePassword);

export {MailRouter};