import express from 'express';
import {
    AddressQueryPrimaryParcelsAttributes,AddressQueryPrimaryParcelsGeometry
} from '../Controllers/QueryPrimaryParcels.mjs';

const ParcelsRouter = express.Router();


//Link :@Post /Parcels/ParcelsAttributeQuery
//Body : {"Property_Address": "Property_Address","Legal_Description": "Legal_Description","Territorial_Authority": "Territorial_Authority","LIM_Reference_Number": "LIM_Reference_Number"}
ParcelsRouter.route("/ParcelsAttributeQuery").post(AddressQueryPrimaryParcelsAttributes);

//Link :@Post /Parcels/ParcelsGeometryQuery
//Body : {"id": "id","inputdata": "inputdata"}
ParcelsRouter.route("/ParcelsGeometryQuery").post(AddressQueryPrimaryParcelsGeometry);


export {ParcelsRouter};