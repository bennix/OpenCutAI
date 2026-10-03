/* tslint:disable */
/* eslint-disable */

export function buildGenerationRequest(input: string): string;

export function buildStoryboardRequest(input: string): string;

export function build_transition(input: string): string;

export function compose_transitions(input: string): string;

export function decodeGenerationResponse(input: string, kind: string): string;

export function fitStoryboardToDuration(input: string, max_seconds: number): string;

export function screenFocusCrop(x: number, y: number, zoom: number, previous_x: number, previous_y: number, dt: number): string;

export function transition_targets(input: string): string;

export function validateEditPlan(plan: string, assets: string): string;

export function validateStoryboard(input: string, assets: string): string;
