import express from 'express';
import {
    Export_Report
} from '../Controllers/Report_Export.mjs';

const Report_Router = express.Router();


//Link :@Post /Reports/Export
//Body : {"response": "response","input": "input"}
Report_Router.route("/Export").post(Export_Report);


export {Report_Router};