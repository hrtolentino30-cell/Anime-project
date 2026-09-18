import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots{return{rules:[{userAgent:'*',allow:'/',disallow:['/api/','/auth/','/history','/my-list','/admin']}],sitemap:'https://www.animori.bond/sitemap.xml',host:'https://www.animori.bond'}}
