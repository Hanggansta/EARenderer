//
//  TexturePool.cpp
//  EARenderer
//
//  Created by Pavel Muratov on 7/3/18.
//  Copyright © 2018 MPO. All rights reserved.
//

#include <stdexcept>

namespace EARenderer {

#pragma mark - Lifecycle

    template <GLTexture::Float Format>
    PostprocessTexturePool<Format>::PostprocessTexturePool(const Size2D& resolution)
    :
    mTextureResolution(resolution)
    { }

#pragma mark - Getters & Setters

    template <GLTexture::Float Format>
    std::shared_ptr<typename PostprocessTexturePool<Format>::PostprocessTexture>
    PostprocessTexturePool<Format>::claim() {
        if (mFreeTextures.empty()) {
            auto texture = std::make_shared<PostprocessTexture>(mTextureResolution);
            texture->generateMipMaps();
            mClaimedTextures.insert(texture);
            return texture;
        }

        auto textureIt = mFreeTextures.begin();
        auto texture = *textureIt;
        mFreeTextures.erase(textureIt);
        mClaimedTextures.insert(texture);
        return texture;
    }

    template <GLTexture::Float Format>
    void PostprocessTexturePool<Format>::putBack(std::shared_ptr<PostprocessTexture> texture) {
        auto textureIt = mClaimedTextures.find(texture);
        if (textureIt == mClaimedTextures.end()) {
            throw std::invalid_argument("Attempt to put a texture in a pool that was never in it in the first place");
        }
        mClaimedTextures.erase(textureIt);
        mFreeTextures.insert(texture);
    }

}