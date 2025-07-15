import express from 'express';
import {
    Register,
    LoginUser
} from '../Controllers/UserController.mjs';

const UserRouter = express.Router();


//Link :@Post /Users/Register
//Body : {"FName": "Fname","LName": "Lname","Email": "Email","Password": "Password"}
UserRouter.route("/Register").post(Register);

//Link :@Post /Users/Login
//Body : {"Email": "Email","Password": "Password"}
UserRouter.route("/Login").post(LoginUser);


export {UserRouter};