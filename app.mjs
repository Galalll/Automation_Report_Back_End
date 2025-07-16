import express from 'express';
import { errorHandler } from "./middleware/errorHandler.mjs";
import dotenv from 'dotenv';
import cors from "cors"
import {UserRouter} from "./routes/UserRouter.mjs";
import {ParcelsRouter} from "./routes/ParcelsRouter.mjs";
import { Report_Router } from "./routes/Report_Router.mjs";
import { TokenValidate } from "./middleware/TokenValidation.mjs";
import { MailRouter } from "./routes/MailRouters.mjs";
dotenv.config()
let port = process.env.PORT || 3000;;
let app = express();
app.use(cors());
app.use(express.json());
app.use(errorHandler);


//API Home
app.get("/",(req,res)=>{
    res.set('Content-Type','text/html; charset=utf-8');
    res.send("<h1>Hello World From Automated Reporting APP</h1>");
})

app.use("/Users",UserRouter);
app.use("/Parcels",ParcelsRouter); 
app.use("/Mail",MailRouter); 
app.use(TokenValidate);
app.use("/Report_Export",Report_Router);

try {
    app.listen(port,()=>{
    console.log("Server is UP");
})
} catch (error) {
    console.error('⚠️  Failed to start app:', error);
    process.exit(1);
}



