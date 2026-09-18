import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots{return{rules:[{userAgent:'*',allow:'/',disallow:['/api/','/auth/','/history','/my-list']}],sitemap:'https://animori.bond/sitemap.xml',host:'https://animori.bond'}}
