import { testFirebaseConfig } from './firebase-test-config.js';
// Central Firebase project selection for the isolated seller preview.
// Only /preview/pr-9/ may use the test project; it fails closed until test credentials are added.
const productionConfig=Object.freeze({
 apiKey:'AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF4',
 authDomain:'zipper-a12f1.firebaseapp.com',
 projectId:'zipper-a12f1',
 storageBucket:'zipper-a12f1.firebasestorage.app',
 messagingSenderId:'729619217486',
 appId:'1:729619217486:web:6350b05ead8ecd70c1171f',
 measurementId:'G-KX0HXC2Z54'
});
const testConfig=testFirebaseConfig;
const isolatedPreview=/(^|\/)preview\/pr-9(?:\/|$)/.test(window.location.pathname);
if(isolatedPreview&&(!testConfig.projectId||testConfig.projectId===productionConfig.projectId)){
 throw new Error('Vista de vendedores aislada: falta configurar un Firebase de pruebas. No se conectó al proyecto real.');
}
export const firebaseConfig=isolatedPreview?testConfig:productionConfig;
export const ORG_ID=firebaseConfig.projectId;
