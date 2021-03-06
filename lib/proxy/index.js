var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var fs = require('fs');
var path = require('path');
var http = require('http');
var methodOverride = require('method-override');

var RESOURCES = 'resources';
var CONFIG_FILE = 'config.json';
var API_VERSION = 0.1;

var initiate = function(options) {
	/*
	 * The options object above has a property called "resourcesDirectory".
	 * The resources directory is the directory in which we'll store config.json
	 * files for EACH collection in our database. So say a database has 3 collections:
	 * people, cars and companies. The tree structure of the resources folder will
	 * be as follows:
	 *
	   resources
	   |______ people
	   |	   |______ config.json
	   |
	   |______ cars
	   |	   |______ config.json
	   |
	   |______ companies
	  		   |______ config.json
	 *
	 * Each config.json will be as follows:
	 *
	  {
	    "type": "Collection",
	    "properties": {
	        "name": {
	            "name": "name",
	            "type": "string",
	            "typeLabel": "string",
	            "required": false,
	            "id": "name",
	            "order": 0
	        },
	        "foundation_year": {
	            "name": "foundation_year",
	            "type": "number",
	            "typeLabel": "number",
	            "required": false,
	            "id": "foundation_year",
	            "order": 1
	    }
	  }
	*/
	var resourcesDirectory = options.proxy.resourcesDirectory;

	// ****************************
	//    M I D D L E W A R E S
	// ****************************
	
	// Allows our API to get the JSON body of the HTTP request
	app.use(bodyParser.json());

	// Allows us to use app.put and app.delete
	app.use(methodOverride('_method'));

	// ****************************
	//  	   R O U T E S
	// ****************************

	/*
	 * Creates the folder for the given collection and its config.json file.
	 * Also note that at this point, the resources folder
	 * should exist, so we won't bother creating it.
	 *
	 * Request body should be as follows:
	 *
	 {
		"type": "Collection",
		"id": "<collection name>",
		"properties": {
			"<property name>": {
				"name": "<property name>",
				"type": "<property type>",
				"typeLabel": "<property type>",
				"required": true | false,
				"id": "<property name>"
			},
			{...}
		}
	 }
	 *
	 * And yes, <property name> should appear 3 times per property (that's just how DPD works).
	 *
	 * Test: {"type": "Collection", "id": "companies", "properties": {"name": {"name": "name", "type": "string", "typeLabel": "string", "required": false, "id": "name"}, "foundation_year": {"name": "foundation_year", "type": "number", "typeLabel": "number", "required": false, "id": "foundation_year"}, "city": {"name": "city", "type": "string", "typeLabel": "string", "required": false, "id": "city"}}}
	 */
	app.post('/resources', function(req, res) {
		var collection = req.body.id;
		var type = req.body.type;
		var properties = req.body.properties;
		var folderName = collection + '_' + new Date().getTime().toString();
		
		// Checks if the folder can be created inside the resources folder.
		if (!fs.existsSync(path.join(resourcesDirectory, folderName))) {
			// If it doesn't exist yet, create it.
			fs.mkdirSync(path.join(resourcesDirectory, folderName));

			/*
			 * Each property might have or might not have an "order" key indicating
			 * the order in which it must be displayed for the user. Regadless if they
			 * have or not, in the config.json file the properties MUST have (because of Deployd).
			 * so the following blocks of code are an algorithm that fills those properties
			 * without the order key with a proper number.
			 */
			var k;
			var found = false;
			var existingOrderKeys = new Array(Object.keys(properties).length);

			// To start off, we'll have an array that has properties.length positions.
			// for each of them we'll mark it with false
			for (var i = 0; i < existingOrderKeys.length; i++) {
				existingOrderKeys[i] = false;
			}

			/*
			 * Now, suppose we have the following property:
			 *
			 	{
					"title": {
						"name": "title",
						"type": "string",
						"typeLabel": "string",
						"required": false,
						"id": "title",
						"order": 2
					}
			 	}
			 *
			 * If the properties object has 5 properties (title is one of them)
			 * then the third position (index 2) of existingOrderKeys will be marked
			 * with true.
			 * After the for loop below, the positions of existingOrderKeys array that have been
			 * marked with true will indicate that there are properties that have got the "order" key.
			 * The positions that were marked with false will indicate that those indexes were not found
			 * in the properties.
			 */
			for (var propertyName in properties) {
				if (typeof properties[propertyName].order !== 'undefined') {
					existingOrderKeys[properties[propertyName].order] = true;
				}
			}

			/*
			 * To help fill the blanks, we'll need an auxiliar variable k.
			 * But before we do that, we need to make sure k has the same value
			 * of the first position in existingOrderKeys that was marked with false.
			 */
			for (var i = 0; (i < existingOrderKeys.length) && (!found); i++) {
				if (!existingOrderKeys[i]) {
					k = i;
					found = true;
				}
			}

			// Now we fill the properties that do not have the order key by appending
			// an order key with value k.
			for (var propertyName in properties) {
				if (typeof properties[propertyName].order === 'undefined') {
					properties[propertyName].order = k;

					// We need to increment k. We can't just do k++ because the next value of
					// k might have been used by a property. So the next value of k must be
					// the next position in existingOrderKeys that is marked with false.
					found = false;
					for (var i = k + 1; (i < existingOrderKeys.length) && (!found); i++) {
						if (!existingOrderKeys[i]) {
							k = i;
							found = true;
						}
					}
				}
			}

			var config = {
				type: type,
				properties: properties
			};

			fs.writeFile(path.join(resourcesDirectory, folderName, CONFIG_FILE), JSON.stringify(config, null, 4), function(err) {
				if (err) res.JSON(err);

				res.set('Access-Control-Allow-Origin', '*').status(201).json({apiVersion: API_VERSION, data: {"collectionId": folderName}, "status": "Ok"});
			});
		} else {
			res.set('Access-Control-Allow-Origin', '*').status(500).json({
				apiVersion: API_VERSION,
				error: {
					code: 500,
					domain: "Deployd Proxy Server",
					message: "The folder could not be created because the unique identifier conflicted with the existing folders",
					reason: "FolderNotCreatedError"	
				}
			});
		}
	});

	/**
	 * Changes the name of the given collections.
	 * 
	 * Payload example:
	 {
		"collections": {
			"<old collection name>": "<new collection name>",
			"<old collection name>": "<new collection name>",
			...
		}
	 }
	 */
	app.put('/resources', function(req, res) {

		// For each collection, we'll need to:
		// 
		// 1 - load the config.json file,
		// 2 - append an "id" property whose value will be the new collection,
		// 3 - call the endpoint /__resources/<old collection name> on DPD server.

		for (oldCollection in req.body.collections) {
			// First step will be to load the old collection's config.json file.
			var p = path.join(resourcesDirectory, oldCollection, CONFIG_FILE);
			var config = JSON.parse(fs.readFileSync(p, 'utf8'));

			// Then, we'll append an "id": <new collection name>
			config.id = req.body.collections[oldCollection];

			// Then call the endpoint /__resources/<old collection name>
			var opts = {
				hostname: 'localhost',
				port: options.deployd.port,
				path: path.join('/__resources', oldCollection),
				method: 'PUT',
				headers: {
					'dpd-ssh-key': 'iaushdiausdh'
				}
			};

			proxyRequestToDeployd(config, options, function(chunk) {
				res.set('Access-Control-Allow-Origin', '*').status(201).json({apiVersion: API_VERSION, data: JSON.parse(chunk)});
			});
		}
	});
	
	/**
	 * Retrieves the name of all the collections that were created.
	 */
	app.get('/resources', function(req, res) {
		var dirs = fs.readdirSync(resourcesDirectory);

		res.set('Access-Control-Allow-Origin', '*')
			.status(200)
			.json({apiVersion: API_VERSION, data: dirs});
	});

	/**
	 * Updates the config.json file adding a property to the collection
	 * Note that it won't be necessary to send the "order" since this code
	 * is already calculating it for us.
	 *
	 * Request body:
	 {
		"<property name>": {
			"name": "<property name>",
			"type": "<property type>",
			"typeLabel": "<property type>",
			"required": true | false,
			"id": "<property name>"
		}
	 }
	 */
	app.put('/resources/:collection', function(req, res) {
		var p = path.join(resourcesDirectory, req.params.collection, CONFIG_FILE);
		var config = JSON.parse(fs.readFileSync(p, 'utf8'));
		var body = req.body;
		var property = Object.keys(body)[0];

		if (typeof config.properties === 'undefined') {
			body[property].order = 0;

			config.properties = {};
		} else {
			var maxOrder = 0;

			for (var key in config.properties) {
				if (config.properties[key].order > maxOrder) {
					maxOrder = config.properties[key].order;
				}
			}

			body[property].order = ++maxOrder;
		}

		config.properties[property] = body[property];

		fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
			if (err) {
				res.set('Access-Control-Allow-Origin', '*').status(500).json({
					apiVersion: API_VERSION,
					error: {
						code: 500,
						domain: "Deployd Proxy Server",
						message: "Could not add property to collection",
						reason: "PropertyNotAddedToCollectionError",
						raw: err
					}
				});
			}

			res.set('Access-Control-Allow-Origin', '*').json({apiVersion: API_VERSION, status: "Ok"});
		});
	});

	/**
	 * Adds a document in the collection. Note that this document should not exist because
	 * this endpoint sends back the document's _id.
	 *
	 {
		"<property name>": "<property value>",
		"<property name>": "<property value>",
		"<property name>": "<property value>",
		...
	 }
	 */
	app.post('/:collection', function(req, res) {
		var opts = {
			hostname: 'localhost',
			port: options.deployd.port,
			path: '/' + req.params.collection,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var proxyRequest = http.request(options, function(response) {
			console.log(response);
			console.log('STATUS: ' + response.statusCode);
			console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				res.set('Access-Control-Allow-Origin', '*').status(201).json({
					apiVersion: API_VERSION,
					data: JSON.parse(chunk)
				});
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();
	});

	/**
	 * Renames property of a given collection.
	 * Example request body:
	 *
	 {
		"properties": {
			"<old property name>": "<new property name>",
			"<old property name>": "<new property name>",
			...
		}
	 }
	 */
	app.put('/:collection/rename', function(req, res) {
		var p = path.join(resourcesDirectory, req.params.collection, CONFIG_FILE);
		var config = JSON.parse(fs.readFileSync(p, 'utf8'));

		var opts = {
			hostname: 'localhost',
			port: options.deployd.port,
			path: path.join('/', req.params.collection, 'rename'),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		/*
		 * First we'll make a request to the deployd server
		 * asking it to rename the property on our mongodb database.
		 */
		var proxyRequest = http.request(options, function(response) {
			console.log(response);
			console.log('STATUS: ' + response.statusCode);
			console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				// At this point, the properties had their names changed
				// in our database. What we need to do now is to
				// change the config.json file to mirror those changes.

				// Walking through the req.body object
				// {"<old property>": "<new property>", ...}
				
				for (var oldKey in req.body.properties) {
					var newKey = req.body.properties[oldKey];
					var newProperty = {
						"name": newKey,
						"type": config.properties[oldKey].type,
						"typeLabel": config.properties[oldKey].typeLabel,
						"required": config.properties[oldKey].required,
						"id": newKey,
						"order": config.properties[oldKey].order
					}

					delete config.properties[oldKey];
					config.properties[newKey] = newProperty;
				}

				fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
					if (err) {
						res.set('Access-Control-Allow-Origin', '*').status(500).json({
							apiVersion: API_VERSION,
							error: {
								code: 500,
								message: "Could not rename property in the config.json file",
								domain: "Deployd Proxy Server",
								reason: "PropertyNotRenamedInJsonFileError",
								raw: err
							}
						});
					}

					res.set('Access-Control-Allow-Origin', '*').status(200).json({apiVersion: API_VERSION, "status": "Ok"});
				});			
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();

		// // Walking through the req.body object
		// // {"<old property>": "<new property>", ...}
		// for (var oldKey in req.body) {
		// 	var newKey = req.body[oldKey];
		// 	var newProperty = {
		// 		"name": newKey,
		// 		"type": config.properties[oldKey].type,
		// 		"typeLabel": config.properties[oldKey].typeLabel,
		// 		"required": config.properties[oldKey].required,
		// 		"id": newKey,
		// 		"order": config.properties[oldKey].order
		// 	}

		// 	delete config.properties[oldKey];
		// 	config.properties[newKey] = newProperty;
		// }

		// fs.writeFile(p, JSON.stringify(config, null, 4), function(err) {
		// 	if (err) res.status(500).json(err);

		// 	res.status(200).json({"status": "Ok"});
		// });
	});

	/**
	 * Updates a document by inserting a new property
	 * 
	 * Request body:
	 {
		"<new property name>": "<property value>",
		...
	 }
	 *
	 * NOTE: in order to add a new property to a document, this
	 * property should've been registered in the config.json file.
	 */
	app.put('/:collection/:documentId([a-zA-Z0-9]+$)', function(req, res) {
		var opts = {
			hostname: 'localhost',
			port: options.deployd.port,
			path: path.join('/', req.params.collection, req.params.documentId),
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var proxyRequest = http.request(options, function(response) {
			// console.log(response);
			// console.log('STATUS: ' + response.statusCode);
			// console.log('HEADERS: ' + JSON.stringify(response.headers));
			response.setEncoding('utf8');

			response.on('data', function (chunk) {
				console.log('BODY: ' + chunk);

				res.set('Access-Control-Allow-Origin', '*').status(200).json({
					apiVersion: API_VERSION,
					data: JSON.parse(chunk)
				});
			});
		});

		proxyRequest.on('error', function(e) {
			console.log('Problem wih request: ' + e.message);
		});

		proxyRequest.write(JSON.stringify(req.body));
		proxyRequest.end();
	});

	/*
	 * Gets the config file of all collection previously created.
	 * The response is an array of object, and each object is nearly identical
	 * to the object in each config.json file. The only difference is that each object
	 * has got an "id" property which corresponds to the collection's name.
	 */
	app.get('/resources/config', function(req, res) {
		// Gets the name of all collections that were created.
		var dirs = fs.readdirSync(resourcesDirectory);
		var arrayOfConfigs = [];

		for (var i = 0; i < dirs.length; i++) {
			var collectionId = dirs[i];

			var p = path.join(resourcesDirectory, collectionId, CONFIG_FILE);
			var config = JSON.parse(fs.readFileSync(p, 'utf8'));
			config.id = collectionId;

			arrayOfConfigs.push(config);
		}

		res.set('Access-Control-Allow-Origin', '*')
			.status(200)
			.json({apiVersion: API_VERSION, data: arrayOfConfigs});
	});

	/*
	 * Retrieves the config file of the given collection.
	 */
	app.get('/:collection/config', function(req, res) {
		var p = path.join(resourcesDirectory, req.params.collection, CONFIG_FILE);
		var config = JSON.parse(fs.readFileSync(p, 'utf8'));

		res.set('Access-Control-Allow-Origin', '*')
			.status(200)
			.json({apiVersion: API_VERSION, data: config});
	});

	// Servers
	var createDeploydServer = require('../deployd');

	createDeploydServer(options.deployd);
		
	app.listen(options.proxy.port, function() {
		console.log('Deployd Proxy Server is running on port ' + options.proxy.port);
	});
}

function proxyRequestToDeployd(body, options, responseCallback) {
	var proxyRequest = http.request(options, function(response) {
		// console.log(response);
		// console.log('STATUS: ' + response.statusCode);
		// console.log('HEADERS: ' + JSON.stringify(response.headers));
		response.setEncoding('utf8');

		response.on('data', function (chunk) {
			console.log('BODY: ' + chunk);

			responseCallback(chunk);
		});
	});

	proxyRequest.on('error', function(e) {
		console.log('Problem wih request: ' + e.message);
	});

	proxyRequest.write(JSON.stringify(body));
	proxyRequest.end();
}

module.exports = initiate;