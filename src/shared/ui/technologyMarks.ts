import Angular from "~icons/vscode-icons/file-type-angular";
import Astro from "~icons/vscode-icons/file-type-astro";
import C from "~icons/vscode-icons/file-type-c";
import Cpp from "~icons/vscode-icons/file-type-cpp";
import CSharp from "~icons/vscode-icons/file-type-csharp2";
import Dart from "~icons/vscode-icons/file-type-dartlang";
import Docker from "~icons/vscode-icons/file-type-docker2";
import Electron from "~icons/vscode-icons/file-type-electron";
import Elixir from "~icons/vscode-icons/file-type-elixir";
import Expo from "~icons/vscode-icons/file-type-expo";
import Go from "~icons/vscode-icons/file-type-go";
import Graphql from "~icons/vscode-icons/file-type-graphql";
import Haskell from "~icons/vscode-icons/file-type-haskell";
import Java from "~icons/vscode-icons/file-type-java";
import JavaScript from "~icons/vscode-icons/file-type-js";
import Kotlin from "~icons/vscode-icons/file-type-kotlin";
import Nextjs from "~icons/vscode-icons/file-type-next";
import Node from "~icons/vscode-icons/file-type-node";
import Nuxt from "~icons/vscode-icons/file-type-nuxt";
import Php from "~icons/vscode-icons/file-type-php";
import Python from "~icons/vscode-icons/file-type-python";
import React from "~icons/vscode-icons/file-type-reactjs";
import Ruby from "~icons/vscode-icons/file-type-ruby";
import Rust from "~icons/vscode-icons/file-type-rust";
import Scala from "~icons/vscode-icons/file-type-scala";
import Svelte from "~icons/vscode-icons/file-type-svelte";
import Swift from "~icons/vscode-icons/file-type-swift";
import Tailwind from "~icons/vscode-icons/file-type-tailwind";
import Tauri from "~icons/vscode-icons/file-type-tauri";
import Terraform from "~icons/vscode-icons/file-type-terraform";
import TypeScript from "~icons/vscode-icons/file-type-typescript";
import Vue from "~icons/vscode-icons/file-type-vue";
import Ada from "~icons/vscode-icons/file-type-ada";
import Ansible from "~icons/vscode-icons/file-type-ansible";
import Assembly from "~icons/vscode-icons/file-type-assembly";
import Bazel from "~icons/vscode-icons/file-type-bazel";
import Capacitor from "~icons/vscode-icons/file-type-capacitor";
import Clojure from "~icons/vscode-icons/file-type-clojure";
import Coffeescript from "~icons/vscode-icons/file-type-coffeescript";
import Crystal from "~icons/vscode-icons/file-type-crystal";
import Django from "~icons/vscode-icons/file-type-django";
import Elm from "~icons/vscode-icons/file-type-elm";
import Ember from "~icons/vscode-icons/file-type-ember";
import Erlang from "~icons/vscode-icons/file-type-erlang";
import Firebase from "~icons/vscode-icons/file-type-firebase";
import Flutter from "~icons/vscode-icons/file-type-flutter";
import Fortran from "~icons/vscode-icons/file-type-fortran";
import Fsharp from "~icons/vscode-icons/file-type-fsharp2";
import Godot from "~icons/vscode-icons/file-type-godot";
import Groovy from "~icons/vscode-icons/file-type-groovy";
import Haxe from "~icons/vscode-icons/file-type-haxe";
import Helm from "~icons/vscode-icons/file-type-helm";
import Ionic from "~icons/vscode-icons/file-type-ionic";
import Julia from "~icons/vscode-icons/file-type-julia";
import Jupyter from "~icons/vscode-icons/file-type-jupyter";
import Lua from "~icons/vscode-icons/file-type-lua";
import Nim from "~icons/vscode-icons/file-type-nim";
import Nix from "~icons/vscode-icons/file-type-nix";
import ObjectiveC from "~icons/vscode-icons/file-type-objectivec";
import Ocaml from "~icons/vscode-icons/file-type-ocaml";
import Perl from "~icons/vscode-icons/file-type-perl";
import Powershell from "~icons/vscode-icons/file-type-powershell";
import Purescript from "~icons/vscode-icons/file-type-purescript";
import R from "~icons/vscode-icons/file-type-r";
import Racket from "~icons/vscode-icons/file-type-racket";
import Rails from "~icons/vscode-icons/file-type-rails";
import Serverless from "~icons/vscode-icons/file-type-serverless";
import Shell from "~icons/vscode-icons/file-type-shell";
import Solidity from "~icons/vscode-icons/file-type-solidity";
import Symfony from "~icons/vscode-icons/file-type-symfony";
import Vlang from "~icons/vscode-icons/file-type-vlang";
import Zig from "~icons/vscode-icons/file-type-zig";
import type { TechnologyId } from "./projectIdentity";

/**
 * The vendor mark for each detected technology. These are artwork naming
 * somebody else's product, so they keep their own colours (DESIGN.md § Icons);
 * `rawSvgImage` turns each raw source string into a cached image component.
 */
export const TECHNOLOGY_MARKS: Record<TechnologyId, string> = {
  tauri: Tauri,
  electron: Electron,
  expo: Expo,
  typescript: TypeScript,
  javascript: JavaScript,
  node: Node,
  react: React,
  nextjs: Nextjs,
  vue: Vue,
  nuxt: Nuxt,
  svelte: Svelte,
  angular: Angular,
  astro: Astro,
  tailwind: Tailwind,
  graphql: Graphql,
  rust: Rust,
  go: Go,
  python: Python,
  php: Php,
  ruby: Ruby,
  java: Java,
  kotlin: Kotlin,
  csharp: CSharp,
  swift: Swift,
  dart: Dart,
  elixir: Elixir,
  haskell: Haskell,
  scala: Scala,
  cpp: Cpp,
  c: C,
  docker: Docker,
  terraform: Terraform,
  flutter: Flutter,
  capacitor: Capacitor,
  ionic: Ionic,
  godot: Godot,
  ember: Ember,
  django: Django,
  rails: Rails,
  symfony: Symfony,
  "objective-c": ObjectiveC,
  perl: Perl,
  lua: Lua,
  r: R,
  julia: Julia,
  zig: Zig,
  nim: Nim,
  clojure: Clojure,
  erlang: Erlang,
  ocaml: Ocaml,
  fsharp: Fsharp,
  crystal: Crystal,
  fortran: Fortran,
  assembly: Assembly,
  powershell: Powershell,
  shell: Shell,
  solidity: Solidity,
  vlang: Vlang,
  groovy: Groovy,
  ada: Ada,
  purescript: Purescript,
  haxe: Haxe,
  racket: Racket,
  coffeescript: Coffeescript,
  jupyter: Jupyter,
  elm: Elm,
  nix: Nix,
  bazel: Bazel,
  ansible: Ansible,
  serverless: Serverless,
  helm: Helm,
  firebase: Firebase,
};
