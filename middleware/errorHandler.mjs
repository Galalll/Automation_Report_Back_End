import {Constants} from "../Constants.mjs";
const errorHandler = (err,req,res,next)=>{
    const StatusCode = res.statusCode ? res.statusCode :500;
    switch (StatusCode) {
        case Constants.VALIDATION_ERROR:
            res.json({title:"VALIDATION ERROR"})
            break;
        case Constants.FORBIDDEN:
            res.json({title:"FORBIDDEN"})
            break;
        case Constants.SERVER_ERROR:
            res.json({title:"SERVER ERROR"})
            break;
        case Constants.UNAUTHORIZED:
            res.json({title:"UNAUTHORIZED"})
            break;
        case Constants.NOT_FOUND:
            res.json({title:"NOT_FOUND"})
            break;
        default:
            break;
    }
    
}

export {errorHandler}
