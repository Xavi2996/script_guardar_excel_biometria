const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// COnfig BDD
const pool = new Pool({
    user: 'postgres',
    host: '192x.x.66',
    database: 'xxxx',
    password: 'xxxxx',
    port: 5000,
  });
  
  // Verifica la conexión a la base de datos
  pool.query('SELECT NOW()', (err, dbRes) => {
    if (err) {
      console.error('Error al conectarse a la base de datos:', err);
    } else {
      console.log('Conexión a la base de datos exitosa:', dbRes.rows[0].now);
    }
  });

  app.get('/', async (req, res) => {
    //await pool.connect();
    // cREA EL WORKBOOK
    const workbook = new ExcelJS.Workbook();
  
    // Consulta 
    const query1 = `
    (SELECT imagen_identidad, prueba_de_vida_biometria, CAST(prueba_de_vida_biometria AS NUMERIC) 
    FROM biometria WHERE fecha_registro > '2024-01-01' AND 
    prueba_de_vida_biometria != '' AND  prueba_de_vida_biometria IS NOT NULL
    AND CAST(prueba_de_vida_biometria AS NUMERIC) >= 80
    ORDER BY fecha_registro DESC LIMIT 20) 
    UNION ALL 
    (SELECT imagen_identidad, prueba_de_vida_biometria, CAST(prueba_de_vida_biometria AS NUMERIC) 
    FROM biometria WHERE fecha_registro > '2024-01-01' AND 
    prueba_de_vida_biometria != '' AND  prueba_de_vida_biometria IS NOT NULL 
    AND CAST(prueba_de_vida_biometria AS NUMERIC) < 80 AND CAST(prueba_de_vida_biometria AS NUMERIC) >= 40
    ORDER BY fecha_registro DESC LIMIT 40)
    UNION ALL 
    (SELECT imagen_identidad, prueba_de_vida_biometria, CAST(prueba_de_vida_biometria AS NUMERIC) 
    FROM biometria WHERE fecha_registro > '2024-01-01' AND 
    prueba_de_vida_biometria != '' AND  prueba_de_vida_biometria IS NOT NULL 
    AND CAST(prueba_de_vida_biometria AS NUMERIC) < 40
    ORDER BY fecha_registro DESC LIMIT 40)
  `;
    const dbRes1 = await pool.query(query1);
    console.log(dbRes1.rows.length);
    // Se aguegan los resultados a la primera hoja
    const worksheet1 = workbook.addWorksheet('Data');
    worksheet1.columns = [
      { header: 'Imagen Identidad', key: 'imagen_identidad', width: 30 },
      { header: 'Prueba de Vida Biometria', key: 'prueba_de_vida_biometria', width: 30 },
    ];
    worksheet1.addRows(dbRes1.rows);
   
   // se guarda el workbook
    await workbook.xlsx.writeFile('Resultados.xlsx');
    //console.log(dbRes1.rows);
          // Descarga imagen_identidad
          for (let i = 0; i < dbRes1.rows.length; i++) {
            const url = dbRes1.rows[i].imagen_identidad;
            await descargarImagen(url, i);
            // await descargarImagen(images[i], i);
            await enviarImagen(i,'servicio8082');
          }

          for (let j = 0; j < dbRes1.rows.length; j++) {
            const url = dbRes1.rows[j].imagen_identidad;
            await descargarImagen(url, j);
            // await descargarImagen(images[i], i);
            await enviarImagen(j, 'servicio8083');
          }

    res.json({ dbRes1: dbRes1.rows});
  });
  
  
  app.listen(port, () => {
    console.log(`App corriendo en http://localhost:${port}`);
  });

  //Funcion para descargar imagenes
  async function descargarImagen(url, i) {
    const pathToFile = path.resolve(__dirname, 'images', `imagen_identidad_${i}.png`);
    const writer = fs.createWriteStream(pathToFile);
  
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    });
  
    response.data.pipe(writer);
  
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  
    console.log(`Archivo imagen_identidad_${i}.png descargado con éxito`);
  }

  // Función para enviar imágenes
    async function enviarImagen(i, servicio) {
        let score;
        let label;
        const pathToFile = path.resolve(__dirname, 'images', `imagen_identidad_${i}.png`);
    
        // Crea un objeto FormData y agrega la imagen
        const formData = new FormData();
        formData.append('photo', fs.createReadStream(pathToFile));
        //console.log(formData.getHeaders());
        // Envía la imagen al servicio
        if (servicio == 'servicio8082') {         
          const res = await axios.post('http://192.168.1.247:8082/upload.php', formData, {
          headers: {
              ...formData.getHeaders(),
          },
          timeout: 60000,
          }); 
  
          if ('score' in res.data) {
            // Procesa la respuesta normalmente
            score = res.data.score;
            label = res.data.label;
          } else {
            score = 'No se pudo obtener el score';
            label = res.data.text;
          }
          guardarRespuestaEnExcel(score, label, JSON.stringify(res.data, null, 2), i, 'servicio8082');
          console.log('servicio8082');
        }

        if (servicio == 'servicio8083') {
          const res2 = await axios.post('http://192.168.1.247:8083/upload.php', formData, {
            headers: {
                ...formData.getHeaders(),
            },timeout: 60000,
            }); 
          //console.log(`Imagen imagen_identidad_${i}.png enviada con éxito: ${JSON.stringify(res.data, null, 2)}`);
          if ('score' in res2.data) {
            // Procesa la respuesta normalmente
            score = res2.data.score;
            label = res2.data.label;
          } else {
            score = 'No se pudo obtener el score';
            label = res2.data.text;
          }
          guardarRespuestaEnExcel(score, label, JSON.stringify(res2.data, null, 2), i, 'servicio8083');
          console.log('servicio8083');
        }
    }

    async function guardarRespuestaEnExcel(score, label, respuesta, i, servicio) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile('Resultados.xlsx'); 
    
      const worksheet = workbook.getWorksheet(1); //Primera hoja
      
      if(servicio === 'servicio8082'){
      // Selección de columna
      const cellScore = worksheet.getCell(`C${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellScore.value = score;
      // Selección de columna
      const cellLabel = worksheet.getCell(`D${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellLabel.value = label;
      // Selección de columna
      const cellJson = worksheet.getCell(`E${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellJson.value = respuesta;
      }

      if(servicio === 'servicio8083'){
      // Selección de columna
      const cellScore = worksheet.getCell(`F${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellScore.value = score;
      // Selección de columna
      const cellLabel = worksheet.getCell(`G${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellLabel.value = label;
      // Selección de columna
      const cellJson = worksheet.getCell(`H${i + 2}`); // i + 1 porque las filas en Excel empiezan en 1, no en 0
      cellJson.value = respuesta;
      }

    
      await workbook.xlsx.writeFile('Resultados.xlsx'); // Guarda los cambios en el archivo Excel
    }
