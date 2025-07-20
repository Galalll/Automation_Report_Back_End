import expressAsyncHandler from "express-async-handler";
import axios from "axios";
import dotenv from "dotenv";
import proj4 from "proj4";
import * as turf from "@turf/turf";

dotenv.config();
const AGOL_Token = process.env.AGOLToken;
const PrimaryParcels = process.env.NZ_Primary_Parcels_URL;
proj4.defs(
    "EPSG:2193",
    "+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);
proj4.defs("EPSG:4167", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");

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
    queryResult.properties = await QueryWFSAttributes(PrimaryParcels, Property_Address,Territorial_Authority);
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

async function QueryWFSAttributes(url, Address,Territorial_Authority) {
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
    
    if (CheckOutCouncilsBorders(turf.bbox(feature))) {
      result.push(feature.properties);
    }
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



async function CheckOutCouncilsBorders(BBox) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [BBox[0], BBox[1]]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [BBox[2], BBox[3]]);
    const ParcelEnvelope = `${xmin},${ymin},${xmax},${ymax}`;
    const CouncilsBordersLayer =
        "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/arcgis/rest/services/Territorial_Authority_2023/FeatureServer/0/query";
    const params = {
        where: "1=1",
        geometry: ParcelEnvelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "TA2023_V_2",
        returnGeometry: false,
        f: "json",
        token: AGOL_Token
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(CouncilsBordersLayer, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
      
        return resp.data.features[0]?.attributes?.TA2023_V_2; // Council found
    } else {
        return false; // No Council found
    }
}