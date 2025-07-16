import expressAsyncHandler from 'express-async-handler';
import axios from 'axios';
import Jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const Users_Table_URL = process.env.User_Table;
const AGOL_Token     = process.env.AGOLToken;
const JWT_SECRET      = process.env.TOKEN_SECRET;

// Registration handler
const Register = expressAsyncHandler(async (req, res) => {
  const { FName, LName, Email, Password } = req.body;

  // Validate input
  if (!FName || !LName || !Email || !Password) {
    
    return res.status(400).json({ message: 'All fields are required!' });
  }

  if (!Users_Table_URL || !AGOL_Token) {
    console.error('Missing AGOL configuration');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  // 1) Check if user already exists
  let queryResult;
  try {
    queryResult = await QueryUsers(Users_Table_URL, `Email = '${Email}'`);
    
  } catch (err) {
    console.error('Error querying users:', err);
    return res.status(500).json({ message: 'Error checking existing user' });
  }

  const existingUser = queryResult.features?.[0];
  if (existingUser) {
    return res.status(400).json({ message: 'Email already exists! Please try to log in.' });
  }

  // 2) Hash the password securely
  const salt           = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(Password, salt);

  // 3) Create new user record in AGOL
  try {
    const addRes = await createUser(Users_Table_URL, {
      FName,
      LName,
      Email,
      Password: hashedPassword,
      Salt: salt
    });
    if (!addRes.addResults || !addRes.addResults[0]?.success) {
      console.error('Error adding user to AGOL:', addRes);
      return res.status(500).json({ message: 'Error creating user' });
    }
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ message: 'Error creating user' });
  }

  // Final response
  return res.status(201).json({ message: 'User registered successfully'});
});

const LoginUser = expressAsyncHandler(async (req, res) => {
  const { Email, Password } = req.body;

  // Validate input
  if (!Email || !Password) {
    return res.status(400).json({ message: 'All fields are required!' });
  }
  if (!Users_Table_URL || !AGOL_Token) {
    console.error('Missing AGOL configuration');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  // 1) Query AGOL for user record
  let queryResult;
  try {
    queryResult = await QueryUsers(Users_Table_URL,`Email='${Email}'`);
    // console.log(queryResult.features[0].attributes.OBJECTID);
    
  } catch (err) {
    console.error('Error querying AGOL:', err);
    return res.status(500).json({ message: 'Error checking user record' });
  }

  const feature = queryResult.features?.[0];
  
  if (!feature) {
    return res.status(404).json({ message: 'User not found. Please enter a valid email.' });
  }

  const attrs = feature.attributes;

  
  const isMatch = await bcrypt.compare(Password, attrs.Password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Wrong password! Unauthorized user' });
  }

  if (!JWT_SECRET) {
    console.error('Missing JWT secret');
    return res.status(500).json({ message: 'Server configuration error' });
  }
  const token = Jwt.sign({
    user: {
      GUID: attrs.GlobalID,
      Email: attrs.Email,
      FirstName: attrs.FName,
      LastName: attrs.LName
    }
  }, JWT_SECRET, { expiresIn: '24h' });

  return res.status(200).json({
    Email: attrs.Email,
    FirstName: attrs.FName,
    LastName: attrs.LName,
    AccessToken: token
  });
});



// Query existing users from AGOL Feature Service
async function QueryUsers(layerURL, whereClause) {
  const url    = `${layerURL}/query`;
  const config = {
    params: {
      where: whereClause,
      outFields: 'FName, LName, Email, OBJECTID,Password',
      f: 'json',
      token: AGOL_Token
    }
  };

  const response = await axios.get(url, config);
  return response.data;
}

// Create new user via applyEdits
async function createUser(layerURL, attributes) {
  const url  = `${layerURL}/applyEdits`;
  const adds = [{ attributes }];
  const data = new URLSearchParams({
    adds: JSON.stringify(adds),
    f: 'json',
    token: AGOL_Token
  }).toString();

  const response = await axios.post(url, data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return response.data;
}

export { Register,LoginUser };
