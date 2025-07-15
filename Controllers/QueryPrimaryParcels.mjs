import expressAsyncHandler from "express-async-handler";
import axios from "axios";
import Jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();
const PrimaryParcels = process.env.NZ_Primary_Parcels_URL;

let AddressQueryPrimaryParcelsAttributes = expressAsyncHandler(async (req, res) => {

  const {
    Property_Address,
    Legal_Description,
    Territorial_Authority,
    LIM_Reference_Number,
  } = req.body;

  if (
    !Property_Address ||
    !Legal_Description ||
    !Territorial_Authority ||
    !LIM_Reference_Number
  ) {
    return res.status(400).json({ message: "All fields are required!" });
  }
  let queryResult = {};
  queryResult.input = req.body;
  try {
    queryResult.properties = await QueryWFSAttributes(PrimaryParcels, Property_Address);
  } catch (err) {
    console.error("Error querying NZ Primary Parcels:", err);
    return res.status(500).json({ message: "Error getting Primary Parcels" });
  }

  return res.status(200).json(queryResult);
});


let AddressQueryPrimaryParcelsGeometry = expressAsyncHandler(async (req, res) => {

  const {id,inputdata } = req.body;
  
  if (
    !id
  ) {
    return res.status(400).json({ message: "All fields are required!" });
  }
  let queryResult;
  try {
    queryResult = await QueryWFSGeometry(PrimaryParcels, id,inputdata);
  } catch (err) {
    console.error("Error querying NZ Primary Parcels:", err);
    return res.status(500).json({ message: "Error getting Primary Parcels" });
  }

  return res.status(200).json(queryResult);
});

async function QueryWFSAttributes(url, Address) {
  var filter =
    '<Filter xmlns="http://www.opengis.net/ogc">' +
    "<PropertyIsEqualTo>" +
    "<PropertyName>appellation</PropertyName>" +
    "<Literal>" +
    Address +
    "</Literal>" +
    "</PropertyIsEqualTo>" +
    "</Filter>";
  var encodedFilter = encodeURIComponent(filter);
  let PrimaryParcelsURL = url + encodedFilter;
  const response = await axios.get(PrimaryParcelsURL);
  let result = [];
  response.data.features.forEach((feature) => {
    result.push(feature.properties);
  })
  return result;
}


async function QueryWFSGeometry(url, id,inputdata) {
  var filter =
    '<Filter xmlns="http://www.opengis.net/ogc">' +
    "<PropertyIsEqualTo>" +
    "<PropertyName>id</PropertyName>" +
    "<Literal>" +
    id +
    "</Literal>" +
    "</PropertyIsEqualTo>" +
    "</Filter>";
  var encodedFilter = encodeURIComponent(filter);
  let PrimaryParcelsURL = url + encodedFilter;
  const response = await axios.get(PrimaryParcelsURL);
  let result = {};
  result.input = inputdata;
  result.response = response.data;
  return result;
}

export { AddressQueryPrimaryParcelsAttributes, AddressQueryPrimaryParcelsGeometry };
