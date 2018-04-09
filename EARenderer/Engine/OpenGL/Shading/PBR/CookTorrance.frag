#version 400 core

// Constants

const float PI = 3.1415926535897932384626433832795;
const int kMaxCascades = 4;

const int kLightTypeDirectional = 0;
const int kLightTypePoint       = 1;
const int kLightTypeSpot        = 2;

const int kGeometryTypeStatic   = 0;
const int kGeometryTypeDynamic  = 1;

// Spherical harmonics
const float kC1 = 0.429043;
const float kC2 = 0.511664;
const float kC3 = 0.743125;
const float kC4 = 0.886227;
const float kC5 = 0.247708;

// Output

out vec4 oFragColor;

// Input

in vec3 vTexCoords;
in vec3 vWorldPosition;
in mat3 vTBN;
in vec4 vPosInLightSpace[kMaxCascades];
in vec4 vPosInCameraSpace;

// Uniforms

struct DirectionalLight {
    vec3 radiantFlux; // a.k.a color
    vec3 direction;
};

struct PointLight {
    vec3 radiantFlux; // a.k.a color
    vec3 position;
};

struct Spotlight {
    vec3 radiantFlux; // a.k.a color
    vec3 position;
    vec3 direction;
    float cutOffAngleCos;
};

struct Material {
    sampler2D albedoMap;
    sampler2D normalMap;
    sampler2D metallicMap;
    sampler2D roughnessMap;
    sampler2D AOMap; // Ambient occlusion
};

struct SH {
    vec3 L00;
    vec3 L11;
    vec3 L10;
    vec3 L1_1;
    vec3 L21;
    vec3 L2_1;
    vec3 L2_2;
    vec3 L20;
    vec3 L22;
};

uniform vec3 uCameraPosition;
uniform mat4 uWorldBoudningBoxTransform;

uniform DirectionalLight uDirectionalLight;
uniform PointLight uPointLight;
uniform Spotlight uSpotlight;
uniform Material uMaterial;

uniform int uLightType;
uniform int uGeometryType;

// Shadow mapping
uniform sampler2DArray uShadowMapArray;
uniform float uDepthSplits[kMaxCascades];
uniform int uNumberOfCascades;

// Shperical harmonics

uniform sampler3D uGridSHMap0;
uniform sampler3D uGridSHMap1;
uniform sampler3D uGridSHMap2;
uniform sampler3D uGridSHMap3;
uniform sampler3D uGridSHMap4;
uniform sampler3D uGridSHMap5;
uniform sampler3D uGridSHMap6;

uniform bool uShouldEvaluateSphericalHarmonics;

// IBL
uniform sampler2D uBRDFIntegrationMap;
uniform samplerCube uSpecularIrradianceMap;
uniform samplerCube uDiffuseIrradianceMap;
uniform int uSpecularIrradianceMapLOD;

////////////////////////////////////////////////////////////
/////////////////// Spherical harmonics ////////////////////
////////////////////////////////////////////////////////////
SH UnpackSH() {
    SH sh;

    // Get 3D texture space coordinates
    vec3 shMapCoords = (uWorldBoudningBoxTransform * vec4(vWorldPosition, 1.0)).xyz;

    vec4 shMap0Data = texture(uGridSHMap0, shMapCoords);
    vec4 shMap1Data = texture(uGridSHMap1, shMapCoords);
    vec4 shMap2Data = texture(uGridSHMap2, shMapCoords);
    vec4 shMap3Data = texture(uGridSHMap3, shMapCoords);
    vec4 shMap4Data = texture(uGridSHMap4, shMapCoords);
    vec4 shMap5Data = texture(uGridSHMap5, shMapCoords);
    vec4 shMap6Data = texture(uGridSHMap6, shMapCoords);

    sh.L00  = vec3(shMap0Data.rgb);
    sh.L11  = vec3(shMap0Data.a, shMap1Data.rg);
    sh.L10  = vec3(shMap1Data.ba, shMap2Data.r);
    sh.L1_1 = vec3(shMap2Data.gba);
    sh.L21  = vec3(shMap3Data.rgb);
    sh.L2_1 = vec3(shMap3Data.a, shMap4Data.rg);
    sh.L2_2 = vec3(shMap4Data.ba, shMap5Data.r);
    sh.L20  = vec3(shMap5Data.gba);
    sh.L22  = vec3(shMap6Data.rgb);

//    // White and green
//    sh.L00  = vec3(1.77245402, 3.54490805, 1.77245402);
//    sh.L11  = vec3(3.06998014, 0.0, 3.06998014);
//    sh.L10  = vec3(0.0);
//    sh.L1_1 = vec3(0.0);
//    sh.L21  = vec3(0.0);
//    sh.L2_1 = vec3(0.0);
//    sh.L2_2 = vec3(0.0);
//    sh.L20  = vec3(-1.9816637, -3.96332741, -1.9816637);
//    sh.L22  = vec3(3.43234229, 6.86468458, 3.43234229);

    return sh;
}

float SHRadiance(SH sh, vec3 direction, int component) {
    int c = component;

    return  kC1 * sh.L22[c] * (direction.x * direction.x - direction.y * direction.y) +
            kC3 * sh.L20[c] * (direction.z * direction.z) +
            kC4 * sh.L00[c] -
            kC5 * sh.L20[c] +
            2.0 * kC1 * (sh.L2_2[c] * direction.x * direction.y + sh.L21[c] * direction.x * direction.z + sh.L2_1[c] * direction.y * direction.z) +
            2.0 * kC2 * (sh.L11[c] * direction.x + sh.L1_1[c] * direction.y + sh.L10[c] * direction.z);
}

vec3 EvaluateSphericalHarmonics(vec3 direction) {
    SH sh = UnpackSH();
    return vec3(SHRadiance(sh, direction, 0), SHRadiance(sh, direction, 1), SHRadiance(sh, direction, 2));
}

////////////////////////////////////////////////////////////
//////////////////// Lighting equation /////////////////////
////////////////////////////////////////////////////////////

// Functions

// The Fresnel equation describes the ratio of surface reflection at different surface angles.
// (This is an approximation of Fresnels' equation, called Fresnel-Schlick)
// Describes the ratio of light that gets reflected over the light that gets refracted,
// which varies over the angle we're looking at a surface.
//
vec3 FresnelSchlick(vec3 V, vec3 H, vec3 albedo, float metallic) {
    // F0 - base reflectivity of a surface, a.k.a. surface reflection at zero incidence
    // or how much the surface reflects if looking directly at the surface
    vec3 F0 = vec3(0.04); // 0.04 is a commonly used constant for dielectrics
    F0 = mix(F0, albedo, metallic);
    
    float cosTheta = max(dot(H, V), 0.0);
    
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// Trowbridge-Reitz GGX normal distribution function
// Statistically approximates the ratio of microfacets aligned to some (halfway) vector h
//
float NormalDistributionGGX(vec3 N, vec3 H, float roughness) {
    float a2        = roughness * roughness;
    float NdotH     = max(dot(N, H), 0.0);
    float NdotH2    = NdotH * NdotH;
    
    float nom       = a2;
    float denom     = (NdotH2 * (a2 - 1.0) + 1.0);
    denom           = PI * denom * denom;
    
    return nom / denom;
}

// Statistically approximates the ratio of microfacets that overshadow each other causing light rays to lose their energy in the process.
// Combination of the GGX and Schlick-Beckmann approximation known as Schlick-GGX.
//
float GeometrySchlickGGX(float NdotV, float roughness) {
    float a         = (roughness + 1.0);
    
    // Here k is a remapping of roughness based on whether we're using the geometry function for either direct lighting or IBL lighting
    float Kdirect   = (a * a) / 8.0;
    float nom       = NdotV;
    float denom     = NdotV * (1.0 - Kdirect) + Kdirect;
    
    return nom / denom;
}

// To effectively approximate the geometry we need to take account of both the view direction (geometry obstruction) and the light direction vector (geometry shadowing).
// We can take both into account using Smith's method:
float GeometrySmith(float NdotL, float NdotV, float roughness) {
    float ggx1 = GeometrySchlickGGX(NdotL, roughness);
    float ggx2 = GeometrySchlickGGX(NdotV, roughness);
    
    return ggx1 * ggx2;
}

vec3 CookTorranceBRDF(vec3 N, vec3 V, vec3 H, vec3 L, float roughness, vec3 albedo, float metallic, vec3 radiance) {
    float NdotL     = max(dot(N, L), 0.0);
    float NdotV     = max(dot(N, V), 0.0);
    
    float NDF       = NormalDistributionGGX(N, H, roughness);
    float G         = GeometrySmith(NdotL, NdotV, roughness);
    vec3 F          = FresnelSchlick(V, H, albedo, metallic);

    vec3 nom        = NDF * G * F;
    float denom     = 4.0 * NdotL * NdotV + 0.001; // Add 0.001 to prevent division by 0
    vec3 specular   = nom / denom;
    
    vec3 Ks         = F;                // Specular (reflected) portion
    vec3 Kd         = vec3(1.0) - Ks;   // Diffuse (refracted) portion
    
    Kd              *= 1.0 - metallic;  // This will turn diffuse component of metallic surfaces to 0
    
    vec3 diffuse    = Kd * albedo / PI * NdotL;
//    diffuse         += Kd * EvaluateSphericalHarmonics(N);
    specular        *= NdotL;

    return (diffuse + specular) * radiance;
}

vec3 IBL(vec3 N, vec3 V, vec3 H, vec3 albedo, float roughness, float metallic) {
    vec3 R = reflect(-V, N);
    vec3 diffuseIrradiance  = texture(uDiffuseIrradianceMap, R).rgb;
    vec3 specularIrradiance = textureLod(uSpecularIrradianceMap, R, roughness * (uSpecularIrradianceMapLOD - 1)).rgb;
    vec3 F                  = FresnelSchlick(V, H, albedo, metallic);
    vec2 envBRDF            = texture(uBRDFIntegrationMap, vec2(max(dot(N, V), 0.0), roughness)).rg;
    
    vec3 Ks         = F;                // Specular (reflected) portion
    vec3 Kd         = vec3(1.0) - Ks;   // Diffuse (refracted) portion
    Kd              *= 1.0 - metallic;  // This will turn diffuse component of metallic surfaces to 0
    
    vec3 diffuse    = diffuseIrradiance * albedo;
    vec3 specular   = (F * envBRDF.x + envBRDF.y) * specularIrradiance;

    return diffuse + specular;
}

////////////////////////////////////////////////////////////
//////////// Radiance of different light types /////////////
////////////////////////////////////////////////////////////

vec3 PointLightRadiance(vec3 N) {
    vec3 Wi                 = normalize(uPointLight.position - vWorldPosition);     // To light vector
    float distance          = length(Wi);                                           // Distance from fragment to light
    float attenuation       = 1.0 / (distance * distance);                          // How much enegry has light lost at current distance
    
    return uPointLight.radiantFlux * attenuation;
}

vec3 DirectionalLightRadiance() {
    return uDirectionalLight.radiantFlux;
}

////////////////////////////////////////////////////////////
///////////////////////// Shadows //////////////////////////
////////////////////////////////////////////////////////////

int shadowCascadeIndex()
{
    vec3 projCoords = vPosInCameraSpace.xyz / vPosInCameraSpace.w;
    // No need to transform to [0,1] range,
    // because splits passed from client are in [-1; 1]
    
    float fragDepth = projCoords.z;
    
    for (int i = 0; i < uNumberOfCascades; ++i) {
        if (fragDepth < uDepthSplits[i]) {
            return i;
        }
    }
}

float Shadow(in vec3 N, in vec3 L)
{
    int shadowCascadeIndex = shadowCascadeIndex();
    
    // perform perspective division
    vec3 projCoords = vPosInLightSpace[shadowCascadeIndex].xyz / vPosInLightSpace[shadowCascadeIndex].w;
    
    // Transformation to [0,1] range
    projCoords = projCoords * 0.5 + 0.5;
    
    // Get closest depth value from light's perspective (using [0,1] range fragPosLight as coords)
    float closestDepth = texture(uShadowMapArray, vec3(projCoords.xy, shadowCascadeIndex)).r;
    
    // Get depth of current fragment from light's perspective
    float currentDepth = projCoords.z;
    
    // Check whether current frag pos is in shadow
    float bias = max(0.01 * (1.0 - dot(N, L)), 0.005);
    
//    float shadow = 0.0;
//    vec3 texelSize = 1.0 / textureSize(uShadowMapArray, 0);
//    for(int x = -2; x <= 2; ++x) {
//        for(int y = -2; y <= 2; ++y) {
//            vec2 xy = projCoords.xy + vec2(x, y) * texelSize.xy;
//            float pcfDepth = texture(uShadowMapArray, vec3(xy, shadowCascadeIndex)).r;
//            float unbiasedDepth = currentDepth - bias;
//            shadow += unbiasedDepth > pcfDepth && unbiasedDepth <= 1.0 ? 1.0 : 0.0;
//        }
//    }
//    shadow /= 36.0;
//    return shadow;
    
    float pcfDepth = texture(uShadowMapArray, vec3(projCoords.xy, shadowCascadeIndex)).r;
    float unbiasedDepth = currentDepth - bias;
    return unbiasedDepth > pcfDepth && unbiasedDepth <= 1.0 ? 1.0 : 0.0;
}

////////////////////////////////////////////////////////////
///////////////////////// Helpers //////////////////////////
////////////////////////////////////////////////////////////

vec3 ReinhardToneMapAndGammaCorrect(vec3 color) {
    vec3 mappedColor = color / (color + vec3(1.0));
    vec3 gammaCorrectedColor = pow(mappedColor, vec3(1.0 / 2.2));
    return gammaCorrectedColor;
}

vec3 ReinhardToneMap(vec3 color) {
    return color / (color + vec3(1.0));
}

vec3 GammaCorrect(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec3 LinearFromSRGB(vec3 sRGB) {
    return pow(sRGB, vec3(2.2));
}

vec3 FetchAlbedoMap() {
//    return LinearFromSRGB(textureLod(uMaterial.albedoMap, vTexCoords.st, 7).rgb);
    return LinearFromSRGB(texture(uMaterial.albedoMap, vTexCoords.st).rgb);
}

vec3 FetchNormalMap() {
    vec3 normal = texture(uMaterial.normalMap, vTexCoords.st).xyz;
    return normalize(vTBN * (normal * 2.0 - 1.0));
}

float FetchMetallicMap() {
    return texture(uMaterial.metallicMap, vTexCoords.st).r;
}

float FetchRoughnessMap() {
    return texture(uMaterial.roughnessMap, vTexCoords.st).r;
}

float FetchAOMap() {
    return texture(uMaterial.AOMap, vTexCoords.st).r;
}

////////////////////////////////////////////////////////////
////////////////////////// Main ////////////////////////////
////////////////////////////////////////////////////////////

void main() {
    float roughness         = FetchRoughnessMap();
    
    // Based on observations by Disney and adopted by Epic Games
    // the lighting looks more correct squaring the roughness
    // in both the geometry and normal distribution function.
    float roughness2        = roughness * roughness;
    
    float metallic          = FetchMetallicMap();
    float ao                = FetchAOMap();
    vec3 albedo             = FetchAlbedoMap();
    vec3 N                  = FetchNormalMap();
    vec3 V                  = normalize(uCameraPosition - vWorldPosition);
    vec3 L                  = vec3(0.0);
    vec3 H                  = normalize(L + V);
    vec3 radiance           = vec3(0.0);
    float shadow            = 0.0;

    // Analytical lighting
    
    if (uLightType == kLightTypeDirectional) {
        radiance    = DirectionalLightRadiance();
        L           = -normalize(uDirectionalLight.direction);
        shadow      = Shadow(N, L);
    } else if (uLightType == kLightTypePoint) {
        radiance    = PointLightRadiance(N);
        L           = normalize(uPointLight.position - vWorldPosition);
    } else if (uLightType == kLightTypeSpot) {
        // Nothing to do here... yet
    }
    
    vec3 specularAndDiffuse = CookTorranceBRDF(N, V, H, L, roughness2, albedo, metallic, radiance);
    
    // Apply shadow factor
//    specularAndDiffuse *= 1.0 - shadow;

    // Image based lighting
    vec3 ambient            = /*IBL(N, V, H, albedo, roughness, metallic)*/vec3(0.01) * ao * albedo;
    vec3 correctColor       = ReinhardToneMapAndGammaCorrect(specularAndDiffuse);

    if (uGeometryType == kGeometryTypeStatic) {
        oFragColor = vec4(correctColor, 1.0);
    } else if (uGeometryType == kGeometryTypeDynamic) {
        oFragColor = vec4(EvaluateSphericalHarmonics(N) * 5.0, 1.0);
    }
}
